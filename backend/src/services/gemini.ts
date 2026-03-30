import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { config } from '../config/index.js';

let model: GenerativeModel | null = null;

function getModel(): GenerativeModel | null {
  if (!config.geminiApiKey) return null;
  if (!model) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    await delay(250);
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
    await delay(250);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error('[gemini] category summary failed:', (err as Error).message);
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
    await delay(500);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error('[gemini] editorial failed:', (err as Error).message);
    return null;
  }
}
