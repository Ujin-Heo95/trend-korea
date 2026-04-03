import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { config } from '../config/index.js';

let model: GenerativeModel | null = null;

export function getModel(): GenerativeModel | null {
  if (!config.geminiApiKey) return null;
  if (!model) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function summarizePost(
  title: string,
  sourceName: string,
): Promise<string | null> {
  const m = getModel();
  if (!m) return null;

  try {
    const result = await m.generateContent(
      `한국어로 한 줄 요약해줘 (50자 이내, 마침표로 끝내기). 뉴스/게시글 제목: "${title}" (출처: ${sourceName})`,
    );
    await delay(50);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error('[gemini] post summary failed:', (err as Error).message);
    return null;
  }
}

export async function summarizeCategory(
  categoryLabel: string,
  titles: readonly string[],
): Promise<string | null> {
  const m = getModel();
  if (!m) return null;

  try {
    const titleList = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const result = await m.generateContent(
      `한국어로 2-3문장 개요 작성 (100자 이내). 카테고리: ${categoryLabel}\n오늘의 인기 글 목록:\n${titleList}`,
    );
    await delay(50);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error('[gemini] category summary failed:', (err as Error).message);
    return null;
  }
}

/**
 * 여러 게시글 제목을 한 번의 API 호출로 배치 요약
 */
export async function summarizePostsBatch(
  items: readonly { title: string; sourceName: string }[],
): Promise<(string | null)[]> {
  const m = getModel();
  if (!m || items.length === 0) return items.map(() => null);

  try {
    const numbered = items.map((it, i) => `${i + 1}. "${it.title}" (${it.sourceName})`).join('\n');
    const result = await m.generateContent(
      `다음 게시글 제목들을 각각 한국어로 한 줄 요약해줘.
규칙: 50자 이내, 마침표로 끝내기, 제목 순서 유지.

응답 형식 (JSON 문자열 배열):
["요약1", "요약2", ...]

게시글 목록:
${numbered}`,
    );
    await delay(50);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[gemini] batch summary: no JSON array:', text.slice(0, 200));
      return items.map(() => null);
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return items.map(() => null);

    return items.map((_, i) => {
      const s = parsed[i];
      return typeof s === 'string' && s.length > 0 ? s.trim() : null;
    });
  } catch (err) {
    console.error('[gemini] batch summary failed:', (err as Error).message);
    return items.map(() => null);
  }
}

/**
 * 급상승 키워드의 이유를 설명
 */
export async function explainBurst(
  keyword: string,
  zScore: number,
  relatedTitles: readonly string[],
): Promise<string | null> {
  const m = getModel();
  if (!m) return null;

  try {
    const titleList = relatedTitles.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const result = await m.generateContent(
      `키워드 "${keyword}"가 최근 급상승 중이다 (z-score: ${zScore.toFixed(1)}).
관련 게시글 제목:
${titleList}

이 키워드가 왜 급상승하는지 1-2문장(80자 이내)으로 한국어로 설명하라. 마침표로 끝낼 것.`,
    );
    await delay(50);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error('[gemini] burst explain failed:', (err as Error).message);
    return null;
  }
}

/**
 * 실시간 미니 이슈 브리핑 생성
 */
export async function generateMiniBriefing(
  topics: readonly { headline: string; keywords: string[]; postCount: number }[],
): Promise<{ briefing: string; keywords: string[] } | null> {
  const m = getModel();
  if (!m || topics.length === 0) return null;

  try {
    const topicList = topics
      .map((t, i) => `${i + 1}. ${t.headline} (키워드: ${t.keywords.join(', ')}, 게시글 ${t.postCount}건)`)
      .join('\n');

    const result = await m.generateContent(
      `당신은 실시간 뉴스 큐레이터입니다. 지금 화제인 토픽 목록입니다:

${topicList}

다음을 한국어로 작성하세요:
1. 핵심 키워드 3-5개 (쉼표 구분)
2. 실시간 이슈 브리핑 2-3문장 (150자 이내): 지금 무엇이 화제이고 왜 중요한지 분석.

JSON 형식: {"keywords":["kw1","kw2",...],"briefing":"..."}`,
    );
    await delay(50);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { keywords?: unknown; briefing?: unknown };
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k: unknown): k is string => typeof k === 'string')
      : [];
    const briefing = typeof parsed.briefing === 'string' ? parsed.briefing.trim() : '';

    if (!briefing) return null;
    return { briefing, keywords };
  } catch (err) {
    console.error('[gemini] mini briefing failed:', (err as Error).message);
    return null;
  }
}

export async function generateEditorial(
  categoryTitles: Record<string, string[]>,
): Promise<string | null> {
  const m = getModel();
  if (!m) return null;

  try {
    const sections = Object.entries(categoryTitles)
      .map(([cat, titles]) => `[${cat}]\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`)
      .join('\n\n');

    const result = await m.generateContent(
      `당신은 한국 시사 전문 편집자입니다. 아래는 오늘 카테고리별 인기 글 목록입니다.

${sections}

다음 3가지를 한국어로 작성해주세요:
1. **오늘의 핵심 키워드** (3-5개, 쉼표 구분)
2. **편집자 브리핑** (3-4문장, 200자 이내): 카테고리를 아우르는 오늘의 트렌드 흐름을 분석하세요. 단순 나열이 아닌, 이슈 간 연결고리와 시사점을 제시하세요.
3. **주목할 포인트** (1-2문장, 80자 이내): 내일 주시할 만한 후속 전개나 관전 포인트를 짚어주세요.

JSON 형식으로 응답: {"keywords":"...","briefing":"...","watchPoint":"..."}`,
    );
    await delay(100);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error('[gemini] editorial failed:', (err as Error).message);
    return null;
  }
}
