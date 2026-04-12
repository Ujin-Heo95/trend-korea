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
    logger.error({ err }, '[discord] webhook error');
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
    logger.error({ err }, '[discord] api key alert webhook error');
  }
}

export async function notifyBackupResult(
  result: { success: boolean; fileName?: string; sizeBytes?: number; durationMs?: number; error?: string },
): Promise<void> {
  if (!config.discordWebhookUrl) return;

  const embed = result.success
    ? {
        title: '💾 DB 백업 완료',
        description: [
          `파일: \`${result.fileName}\``,
          `크기: ${Math.round((result.sizeBytes ?? 0) / 1024)}KB`,
          `소요: ${((result.durationMs ?? 0) / 1000).toFixed(1)}초`,
        ].join('\n'),
        color: 0x22cc44,
        footer: { text: new Date().toISOString() },
      }
    : {
        title: '❌ DB 백업 실패',
        description: (result.error ?? 'unknown error').slice(0, 500),
        color: 0xff4444,
        footer: { text: new Date().toISOString() },
      };

  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      console.error(`[discord] backup alert webhook failed: ${res.status}`);
    }
  } catch (err) {
    logger.error({ err }, '[discord] backup alert webhook error');
  }
}

export async function notifyPipelineWarning(
  pipeline: string,
  message: string,
): Promise<void> {
  if (!config.discordWebhookUrl) return;

  const body = {
    embeds: [
      {
        title: `⚠️ 파이프라인 경고: ${pipeline}`,
        description: message.slice(0, 500),
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
      console.error(`[discord] pipeline warning webhook failed: ${res.status}`);
    }
  } catch (err) {
    logger.error({ err }, '[discord] pipeline warning webhook error');
  }
}

export async function notifyQualityReport(message: string): Promise<void> {
  if (!config.discordWebhookUrl) return;
  const body = {
    embeds: [
      {
        title: '🧪 일일 품질 리포트 (LLM judge)',
        description: message.slice(0, 1500),
        color: 0x4477ee,
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
    if (!res.ok) console.error(`[discord] quality report webhook failed: ${res.status}`);
  } catch (err) {
    logger.error({ err }, '[discord] quality report webhook error');
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
    logger.error({ err }, '[discord] budget alert webhook error');
  }
}
