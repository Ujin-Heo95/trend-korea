import { config } from '../config/index.js';

export interface ScraperError {
  sourceKey: string;
  error: string;
}

export async function notifyScraperErrors(
  priority: string,
  errors: readonly ScraperError[],
): Promise<void> {
  if (!config.discordWebhookUrl || errors.length === 0) return;

  const lines = errors.map(
    (e) => `• **${e.sourceKey}**: ${e.error.slice(0, 200)}`,
  );

  const body = {
    embeds: [
      {
        title: `⚠️ 스크래퍼 에러 (${priority})`,
        description: lines.join('\n'),
        color: 0xff4444,
        footer: { text: `${errors.length}개 실패 | ${new Date().toISOString()}` },
      },
    ],
  };

  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[discord] webhook failed: ${res.status}`);
    }
  } catch (err) {
    console.error('[discord] webhook error:', err);
  }
}
