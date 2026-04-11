import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdmin } from '../middleware/adminAuth.js';
import { pool } from '../db/client.js';
import { getAllSources, getSourceOverrides, buildOneScraper } from '../scrapers/registry.js';
import { getCircuitStates, CIRCUIT_BREAKER_COOLDOWN_MS } from '../scrapers/base.js';

interface ToggleBody { enabled: boolean }

const MANUAL_RUN_TIMEOUT_MS = 30_000;

export async function adminScraperRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/admin/scrapers/status ──────────────────
  app.get('/api/admin/scrapers/status', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(req, reply)) return;

    const sources = getAllSources();
    const overrides = await getSourceOverrides(pool);
    const cbStates = getCircuitStates();

    const { rows: recentRuns } = await pool.query<{
      source_key: string;
      started_at: string;
      finished_at: string | null;
      posts_saved: number | null;
      error_message: string | null;
    }>(`SELECT source_key, started_at, finished_at, posts_saved, error_message
        FROM scraper_runs
        WHERE started_at > NOW() - INTERVAL '24 hours'
        ORDER BY started_at DESC`);

    const runsBySource = new Map<string, typeof recentRuns>();
    for (const run of recentRuns) {
      const list = runsBySource.get(run.source_key) ?? [];
      list.push(run);
      runsBySource.set(run.source_key, list);
    }

    const result = sources.map(s => {
      const override = overrides.get(s.key);
      const effectiveEnabled = override !== undefined ? override : s.enabled;
      const cb = cbStates.get(s.key);
      const runs = runsBySource.get(s.key) ?? [];

      return {
        key: s.key,
        name: s.name,
        category: s.category,
        priority: s.priority,
        json_enabled: s.enabled,
        override_enabled: override ?? null,
        effective_enabled: effectiveEnabled,
        circuit_breaker: cb ? {
          failures: cb.failures,
          is_open: cb.openedAt !== null,
          cooldown_remaining_ms: cb.openedAt
            ? Math.max(0, CIRCUIT_BREAKER_COOLDOWN_MS - (Date.now() - cb.openedAt))
            : 0,
        } : null,
        recent_runs: runs.slice(0, 5),
      };
    });

    return reply.send(result);
  });

  // ── POST /api/admin/scrapers/:sourceKey/toggle ─────
  app.post('/api/admin/scrapers/:sourceKey/toggle', async (req: FastifyRequest<{
    Params: { sourceKey: string };
    Body: ToggleBody;
  }>, reply: FastifyReply) => {
    if (!requireAdmin(req, reply)) return;

    const { sourceKey } = req.params;
    const { enabled } = req.body ?? {};

    if (typeof enabled !== 'boolean') {
      return reply.status(400).send({ error: 'enabled (boolean) is required' });
    }

    const source = getAllSources().find(s => s.key === sourceKey);
    if (!source) {
      return reply.status(404).send({ error: `Source ${sourceKey} not found` });
    }

    await pool.query(
      `INSERT INTO scraper_source_overrides (source_key, enabled, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (source_key) DO UPDATE SET enabled = $2, updated_at = NOW()`,
      [sourceKey, enabled],
    );

    return reply.send({ source_key: sourceKey, enabled });
  });

  // ── POST /api/admin/scrapers/:sourceKey/run ────────
  app.post('/api/admin/scrapers/:sourceKey/run', async (req: FastifyRequest<{
    Params: { sourceKey: string };
  }>, reply: FastifyReply) => {
    if (!requireAdmin(req, reply)) return;

    const { sourceKey } = req.params;
    const source = getAllSources().find(s => s.key === sourceKey);
    if (!source) {
      return reply.status(404).send({ error: `Source ${sourceKey} not found` });
    }

    const cb = getCircuitStates().get(sourceKey);
    if (cb?.openedAt !== null && cb?.openedAt !== undefined) {
      const remaining = Math.max(0, CIRCUIT_BREAKER_COOLDOWN_MS - (Date.now() - cb.openedAt));
      if (remaining > 0) {
        return reply.status(409).send({
          error: `Circuit breaker open for ${sourceKey}`,
          cooldown_remaining_ms: remaining,
        });
      }
    }

    // Log run start
    const { rows: [{ id: runId }] } = await pool.query<{ id: number }>(
      `INSERT INTO scraper_runs (source_key, started_at) VALUES ($1, NOW()) RETURNING id`,
      [sourceKey],
    );

    try {
      const scraper = await buildOneScraper(source, pool);
      if (!scraper) {
        await pool.query(
          `UPDATE scraper_runs SET finished_at = NOW(), error_message = $1 WHERE id = $2`,
          ['Failed to build scraper', runId],
        );
        return reply.status(500).send({ error: 'Failed to build scraper' });
      }
      scraper.category = source.category;
      scraper.subcategory = source.subcategory;

      const result = await Promise.race([
        scraper.run(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Manual run timed out')), MANUAL_RUN_TIMEOUT_MS),
        ),
      ]);

      await pool.query(
        `UPDATE scraper_runs SET finished_at = NOW(), posts_saved = $1, error_message = $2 WHERE id = $3`,
        [result.count, result.error ?? null, runId],
      );

      return reply.send({ count: result.count, error: result.error ?? null });
    } catch (err) {
      const msg = String(err);
      await pool.query(
        `UPDATE scraper_runs SET finished_at = NOW(), posts_saved = 0, error_message = $1 WHERE id = $2`,
        [msg, runId],
      ).catch(() => {});
      return reply.status(500).send({ error: msg });
    }
  });
}
