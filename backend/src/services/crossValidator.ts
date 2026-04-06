import type { Pool } from 'pg';
import pLimit from 'p-limit';
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
const API_CONCURRENCY = 5;

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

  // Extract keywords for all issues
  const issueKeywords = issues.map(issue => ({
    ...issue,
    keyword: issue.matched_trend_keywords[0] ?? extractKeyword(issue.title),
  }));

  const validIssues = issueKeywords.filter(i => i.keyword !== null);
  if (validIssues.length === 0) return 0;

  // Batch: check trend_keywords for all keywords in one query
  const allKeywords = validIssues.map(i => i.keyword!.toLowerCase().replace(/\s/g, ''));
  const trendMatchMap = await checkTrendKeywordsBatch(pool, allKeywords);

  // Parallel: external API checks with concurrency limit
  const limit = pLimit(API_CONCURRENCY);
  const results = await Promise.all(
    validIssues.map((issue, idx) =>
      limit(async () => {
        const keyword = issue.keyword!;
        const normalizedKw = allKeywords[idx];
        const sources: string[] = [...(trendMatchMap.get(normalizedKw) ?? [])];

        const [youtubeMatch, naverMatch] = await Promise.all([
          checkYouTubeSearch(keyword),
          checkNaverSearch(keyword),
        ]);

        if (youtubeMatch) sources.push('youtube_search');
        if (naverMatch) sources.push('naver_search');

        const uniqueSources = [...new Set(sources)];
        const sourceCount = Math.min(uniqueSources.length, 4);
        const multiplier = CROSS_VALIDATION_MULTIPLIERS[sourceCount]
          ?? Math.min(1.0 + sourceCount * 0.1, MAX_MULTIPLIER);

        return { id: issue.id, multiplier, uniqueSources };
      }),
    ),
  );

  // Batch update results
  for (const r of results) {
    await pool.query(
      `UPDATE issue_rankings
       SET cross_validation_score = $1, cross_validation_sources = $2
       WHERE id = $3`,
      [r.multiplier, r.uniqueSources, r.id],
    );
  }

  if (results.length > 0) {
    console.log(`[crossValidator] validated ${results.length} issues`);
  }
  return results.length;
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

// ─── Check 1: trend_keywords table — batch query (zero API cost) ───

async function checkTrendKeywordsBatch(
  pool: Pool,
  keywords: string[],
): Promise<Map<string, string[]>> {
  if (keywords.length === 0) return new Map();

  // Build a single query with ANY array matching
  const { rows } = await pool.query<{ keyword_normalized: string; source_key: string }>(
    `SELECT DISTINCT keyword_normalized, source_key FROM trend_keywords
     WHERE expires_at > NOW()
       AND keyword_normalized = ANY($1)`,
    [keywords],
  );

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.keyword_normalized) ?? [];
    arr.push(r.source_key);
    map.set(r.keyword_normalized, arr);
  }

  // Also check partial matches (keyword contains trend or trend contains keyword)
  const { rows: partialRows } = await pool.query<{ source_key: string; matched_kw: string }>(
    `SELECT DISTINCT tk.source_key, kw.val AS matched_kw
     FROM trend_keywords tk, unnest($1::text[]) AS kw(val)
     WHERE tk.expires_at > NOW()
       AND tk.keyword_normalized != kw.val
       AND (tk.keyword_normalized LIKE '%' || kw.val || '%'
            OR kw.val LIKE '%' || tk.keyword_normalized || '%')`,
    [keywords],
  );

  for (const r of partialRows) {
    const arr = map.get(r.matched_kw) ?? [];
    arr.push(r.source_key);
    map.set(r.matched_kw, [...new Set(arr)]);
  }

  return map;
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
