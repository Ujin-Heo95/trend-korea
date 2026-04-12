import pLimit from 'p-limit';
import { batchPool } from '../db/client.js';
// 스크래퍼 메타 로깅(scraper_runs) + 모든 post insert 는 batchPool 사용.
// apiPool 은 HTTP 라우트 전용 — 절대 침범 금지 (하드 격리 불변식).
// buildScrapers 는 첫 호출 시 받은 pool 을 freeze 하므로 batchPool 을 항상 전달해야 한다.
import { buildScrapers, getSourcesByPriority } from './registry.js';
import type { ResolvedScraper, SourcePriority } from './registry.js';
import { notifyScraperErrors, type ScraperError } from '../services/discord.js';
import { enrichYoutubeEngagement } from '../services/youtubeEnrichment.js';

const YOUTUBE_NEWS_SOURCES = new Set([
  'youtube_sbs_news', 'youtube_ytn', 'youtube_mbc_news',
  'youtube_kbs_news', 'youtube_jtbc_news',
]);

const SCRAPER_TIMEOUT_MS = 30_000;
const runningLocks = new Map<string, boolean>();

/** 타임아웃 래퍼: 지정 시간 초과 시 reject. 내부 HTTP 요청은 자체 timeout으로 정리됨 */
function withTimeout<T>(promiseFn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[${label}] timed out after ${ms}ms`)), ms);
    promiseFn().then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function logRunStart(sourceKey: string): Promise<number> {
  const r = await batchPool.query<{ id: number }>(
    `INSERT INTO scraper_runs (source_key, started_at) VALUES ($1, NOW()) RETURNING id`,
    [sourceKey]
  );
  return r.rows[0].id;
}

async function logRunEnd(runId: number, postsSaved: number, errorMessage: string | null): Promise<void> {
  await batchPool.query(
    `UPDATE scraper_runs SET finished_at = NOW(), posts_saved = $1, error_message = $2 WHERE id = $3`,
    [postsSaved, errorMessage, runId]
  );
}

async function runScraper(entry: ResolvedScraper): Promise<ScraperError | null> {
  let runId: number | null = null;
  try {
    runId = await logRunStart(entry.sourceKey);
    const result = await withTimeout(() => entry.scraper.run(), SCRAPER_TIMEOUT_MS, entry.sourceKey);
    await logRunEnd(runId, result.count, result.error ?? null);
    if (result.error) {
      console.error(`[scraper:${entry.sourceKey}] saved: ${result.count} err: ${result.error}`);
      return { sourceKey: entry.sourceKey, error: result.error };
    }
    console.log(`[scraper:${entry.sourceKey}] saved: ${result.count}`);
    return null;
  } catch (err) {
    const msg = String(err);
    console.error(`[scraper:${entry.sourceKey}] fatal:`, msg);
    if (runId !== null) {
      await logRunEnd(runId, 0, msg).catch(() => {});
    }
    return { sourceKey: entry.sourceKey, error: msg };
  }
}

export async function runScrapersByPriority(priority: SourcePriority): Promise<void> {
  if (runningLocks.get(priority)) {
    console.warn(`[scheduler] ${priority}-priority scrapers already running — skipping`);
    return;
  }

  runningLocks.set(priority, true);
  try {
    const all = await buildScrapers(batchPool);
    const entries = all.filter(s => s.priority === priority);
    if (entries.length === 0) return;

    console.log(`[scheduler] running ${entries.length} ${priority}-priority scrapers`);
    const limit = pLimit(4);
    const results = await Promise.allSettled(entries.map(e => limit(() => runScraper(e))));
    const errors: ScraperError[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const msg = String(r.reason);
        console.error(`[scraper:${entries[i].sourceKey}] unhandled rejection:`, msg);
        errors.push({ sourceKey: entries[i].sourceKey, error: msg });
      } else if (r.value) {
        errors.push(r.value);
      }
    });
    if (errors.length > 0) {
      await notifyScraperErrors(priority, errors).catch(err => console.warn('[discord] notification failed:', err));
    }

    // 즉시 보강: youtube_*_news 가 이번 라운드에 돌았다면 신규 video post 의 stats 공백을
    // 30분 cron tick 까지 기다리지 않고 바로 채운다. enrichYoutubeEngagement 는 idempotent
    // (GREATEST UPDATE) + 48h 윈도우 라 다음 cron 과 충돌해도 안전.
    const ranYoutubeNews = entries.some(e => YOUTUBE_NEWS_SOURCES.has(e.sourceKey));
    if (ranYoutubeNews) {
      await enrichYoutubeEngagement(batchPool).catch(err =>
        console.warn('[scrapers] post-scrape yt-enrich failed:', err)
      );
    }
  } finally {
    runningLocks.set(priority, false);
  }
}

export async function runAllScrapers(): Promise<void> {
  if (runningLocks.get('all')) {
    console.warn(`[scheduler] all-scrapers already running — skipping`);
    return;
  }

  runningLocks.set('all', true);
  try {
    const entries = await buildScrapers(batchPool);
    console.log(`[scheduler] running all ${entries.length} scrapers`);
    const limit = pLimit(4); // 전체 실행 시 동시성 제한 (DB 풀 max=15 대비 안전)
    const results = await Promise.allSettled(entries.map(e => limit(() => runScraper(e))));
    const errors: ScraperError[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const msg = String(r.reason);
        console.error(`[scraper:${entries[i].sourceKey}] unhandled rejection:`, msg);
        errors.push({ sourceKey: entries[i].sourceKey, error: msg });
      } else if (r.value) {
        errors.push(r.value);
      }
    });
    if (errors.length > 0) {
      await notifyScraperErrors('all', errors).catch(err => console.warn('[discord] notification failed:', err));
    }
  } finally {
    runningLocks.set('all', false);
  }
}

/** Wait for all running scraper batches to finish (up to timeoutMs). */
export async function awaitRunningScrapers(timeoutMs = 15_000): Promise<void> {
  const isRunning = () => Array.from(runningLocks.values()).some(Boolean);
  if (!isRunning()) return;
  console.log('[scrapers] waiting for running scrapers to finish...');
  const deadline = Date.now() + timeoutMs;
  while (isRunning() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (isRunning()) {
    console.warn('[scrapers] timeout — proceeding with shutdown despite running scrapers');
  } else {
    console.log('[scrapers] all scrapers finished');
  }
}
