import { ApifyClient } from 'apify-client';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import { config } from '../config/index.js';
import { notifyBudgetAlert } from '../services/discord.js';
import type { ScrapedPost } from './types.js';

export abstract class ApifyBaseScraper extends BaseScraper {
  private readonly actorId: string;
  private readonly actorInput: Record<string, unknown>;

  constructor(pool: Pool, actorId: string, actorInput: Record<string, unknown> = {}) {
    super(pool);
    this.actorId = actorId;
    this.actorInput = actorInput;
  }

  abstract mapResult(item: Record<string, unknown>): ScrapedPost | null;

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.apifyApiToken) {
      console.warn(`[apify:${this.actorId}] APIFY_API_TOKEN not set — skipping`);
      return [];
    }

    const budgetExceeded = await this.isBudgetExceeded();
    if (budgetExceeded) {
      console.warn(`[apify:${this.actorId}] monthly budget exceeded — skipping`);
      return [];
    }

    const client = new ApifyClient({ token: config.apifyApiToken });
    const runResult = await client.actor(this.actorId).call(this.actorInput);
    const { items } = await client.dataset(runResult.defaultDatasetId).listItems();

    const estimatedCostCents = Math.max(1, Math.round(items.length * 0.1));
    await this.recordUsage(items.length, estimatedCostCents);

    const posts: ScrapedPost[] = [];
    for (const item of items) {
      const post = this.mapResult(item as Record<string, unknown>);
      if (post) posts.push(post);
    }

    return posts.slice(0, 30);
  }

  private async isBudgetExceeded(): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT COALESCE(SUM(cost_usd * 100), 0)::integer AS total_cents
         FROM apify_usage
         WHERE date_trunc('month', executed_at) = date_trunc('month', NOW())`,
      );
      const totalCents = result.rows[0]?.total_cents ?? 0;
      if (totalCents >= config.apifyMonthlyBudgetCents) {
        await notifyBudgetAlert(totalCents, config.apifyMonthlyBudgetCents);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`[apify] budget check failed:`, err);
      return false;
    }
  }

  private async recordUsage(itemsCount: number, costCents: number): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO apify_usage (actor_id, source_key, cost_usd, items_count)
         VALUES ($1, $2, $3, $4)`,
        [this.actorId, this.category ?? 'sns', costCents / 100, itemsCount],
      );
    } catch (err) {
      console.warn(`[apify] usage recording failed:`, err);
    }
  }
}
