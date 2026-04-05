import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

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
    logger.error('[discord] webhook error:', err);
  }
}

const apiKeyAlertCooldowns = new Map<string, number>();
const API_KEY_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1시간

export async function notifyApiKeyFailure(
  apiKey: string,
  error: string,
): Promise<void> {
  if (!config.discordWebhookUrl) return;

  const lastAlerted = apiKeyAlertCooldowns.get(apiKey) ?? 0;
  if (Date.now() - lastAlerted < API_KEY_ALERT_COOLDOWN_MS) return;

  const body = {
    embeds: [
      {
        title: `🔑 API 키 검증 실패: ${apiKey}`,
        description: error.slice(0, 500),
        color: 0xff8800,
        footer: { text: new Date().toISOString() },
      },
    ],
  };

  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      apiKeyAlertCooldowns.set(apiKey, Date.now());
    } else {
      console.error(`[discord] api key alert webhook failed: ${res.status}`);
    }
  } catch (err) {
    logger.error('[discord] api key alert webhook error:', err);
  }
}

export async function notifyBudgetAlert(
  usedCents: number,
  budgetCents: number,
): Promise<void> {
  if (!config.discordWebhookUrl) return;

  const usedUsd = (usedCents / 100).toFixed(2);
  const budgetUsd = (budgetCents / 100).toFixed(2);

  const body = {
    embeds: [
      {
        title: '💰 Apify 월간 예산 한도 도달',
        description: `사용: $${usedUsd} / 한도: $${budgetUsd}\nApify 스크래퍼가 이번 달 나머지 기간 동안 중단됩니다.`,
        color: 0xff8800,
        footer: { text: new Date().toISOString() },
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
      console.error(`[discord] budget alert webhook failed: ${res.status}`);
    }
  } catch (err) {
    logger.error('[discord] budget alert webhook error:', err);
  }
}
