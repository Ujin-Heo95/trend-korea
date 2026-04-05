import type { Pool } from 'pg';
import { config } from '../config/index.js';

/**
 * 교차검증 서비스: 15분마다 상위 이슈의 키워드를 외부 API로 확인
 * - Naver DataLab 검색 트렌드
 * - YouTube Data API 검색
 * - Google Trends RSS (기존 trend_keywords 재활용)
 *
 * 결과를 issue_rankings.cross_validation_score/sources에 반영
 */

// ─── Constants ───

const CROSS_VALIDATION_MULTIPLIERS: Record<number, number> = {
  0: 0.85,  // 미확인 → 감점
  1: 1.0,   // 1개 소스 확인
  2: 1.10,  // 2개 소스 확인
  3: 1.20,  // 3개 소스 확인
};
const MAX_MULTIPLIER = 1.30;

let isValidating = false;

// ─── Main Entry ───

export async function crossValidateIssues(pool: Pool): Promise<number> {
  if (isValidating) {
    console.warn('[crossValidator] skipping — previous run still active');
    return 0;
  }
  isValidating = true;
  try {
    return await _crossValidate(pool);
  } finally {
    isValidating = false;
  }
}

async function _crossValidate(pool: Pool): Promise<number> {
  // Fetch top 30 issues with their keywords
  const { rows: issues } = await pool.query<{
    id: number;
    title: string;
    issue_score: number;
    matched_trend_keywords: string[];
  }>(
    `SELECT id, title, issue_score, matched_trend_keywords
     FROM issue_rankings
     WHERE expires_at > NOW()
     ORDER BY issue_score DESC
     LIMIT 30`,
  );

  if (issues.length === 0) return 0;

  let updated = 0;

  for (const issue of issues) {
    // Extract representative keyword (first matched keyword, or first 2 title words)
    const keyword = issue.matched_trend_keywords[0]
      ?? extractKeyword(issue.title);

    if (!keyword) continue;

    const sources: string[] = [];

    // 1. Check trend_keywords table (Google Trends, BigKinds, Naver DataLab, etc.)
    const trendMatch = await checkTrendKeywords(pool, keyword);
    sources.push(...trendMatch);

    // 2. YouTube Data API search
    const youtubeMatch = await checkYouTubeSearch(keyword);
    if (youtubeMatch) sources.push('youtube_search');

    // 3. Naver search trend (via API)
    const naverMatch = await checkNaverSearch(keyword);
    if (naverMatch) sources.push('naver_search');

    const uniqueSources = [...new Set(sources)];
    const sourceCount = Math.min(uniqueSources.length, 4);
    const multiplier = CROSS_VALIDATION_MULTIPLIERS[sourceCount]
      ?? Math.min(1.0 + sourceCount * 0.1, MAX_MULTIPLIER);

    await pool.query(
      `UPDATE issue_rankings
       SET cross_validation_score = $1, cross_validation_sources = $2
       WHERE id = $3`,
      [multiplier, uniqueSources, issue.id],
    );
    updated++;
  }

  if (updated > 0) {
    console.log(`[crossValidator] validated ${updated} issues`);
  }
  return updated;
}

// ─── Keyword Extraction ───

function extractKeyword(title: string): string | null {
  // Remove common prefixes/suffixes and take meaningful chunk
  const cleaned = title
    .replace(/[[\]()""''「」…·\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(w => w.length >= 2);
  return words.slice(0, 2).join(' ') || null;
}

// ─── Check 1: trend_keywords table (zero API cost) ───

async function checkTrendKeywords(pool: Pool, keyword: string): Promise<string[]> {
  const normalized = keyword.toLowerCase().replace(/\s/g, '');
  const { rows } = await pool.query<{ source_key: string }>(
    `SELECT DISTINCT source_key FROM trend_keywords
     WHERE expires_at > NOW()
       AND (keyword_normalized LIKE '%' || $1 || '%'
            OR $1 LIKE '%' || keyword_normalized || '%')`,
    [normalized],
  );
  return rows.map(r => r.source_key);
}

// ─── Check 2: YouTube Data API search ───

async function checkYouTubeSearch(keyword: string): Promise<boolean> {
  if (!config.youtubeApiKey) return false;

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: keyword,
      type: 'video',
      regionCode: 'KR',
      relevanceLanguage: 'ko',
      maxResults: '3',
      order: 'relevance',
      publishedAfter: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      key: config.youtubeApiKey,
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return false;

    const data = await res.json() as { pageInfo?: { totalResults?: number } };
    return (data.pageInfo?.totalResults ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Check 3: Naver Search (via Naver Open API) ───

async function checkNaverSearch(keyword: string): Promise<boolean> {
  if (!config.naverClientId || !config.naverClientSecret) return false;

  try {
    const params = new URLSearchParams({
      query: keyword,
      display: '3',
      sort: 'date',
    });

    const res = await fetch(`https://openapi.naver.com/v1/search/news.json?${params}`, {
      headers: {
        'X-Naver-Client-Id': config.naverClientId,
        'X-Naver-Client-Secret': config.naverClientSecret,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return false;

    const data = await res.json() as { total?: number };
    return (data.total ?? 0) > 0;
  } catch {
    return false;
  }
}
