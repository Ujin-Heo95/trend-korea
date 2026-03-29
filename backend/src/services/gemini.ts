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
