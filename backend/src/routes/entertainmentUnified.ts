import type { FastifyInstance } from 'fastify';
import { LRUCache } from '../cache/lru.js';

// ── Types ────────────────────────────────────────────

interface UnifiedItem {
  unifiedRank: number;
  title: string;
  subtitle: string;
  thumbnail: string | null;
  url: string;
  sourceCount: number;
  metadata: Record<string, unknown>;
}

interface CategoryResult {
  items: UnifiedItem[];
  lastUpdated: string | null;
}

interface UnifiedResponse {
  categories: Record<string, CategoryResult>;
}

interface RawPost {
  source_key: string;
  title: string;
  url: string;
  thumbnail: string | null;
  metadata: Record<string, unknown> | null;
  scraped_at: string;
}

// ── Config ───────────────────────────────────────────

const MUSIC_SOURCES = ['melon_chart', 'bugs_chart', 'genie_chart', 'kworb_spotify_kr', 'kworb_youtube_kr'] as const;
const MUSIC_WEIGHTS: Record<string, number> = {
  melon_chart: 1.2,
  bugs_chart: 1.0,
  genie_chart: 1.0,
  kworb_spotify_kr: 0.8,
  kworb_youtube_kr: 0.8,
};
// Thumbnail priority: prefer sources with album art
const MUSIC_THUMB_PRIORITY = ['melon_chart', 'bugs_chart', 'genie_chart'];

const BOOK_SOURCES = ['yes24_bestseller', 'aladin_bestseller'] as const;
const BOOK_THUMB_PRIORITY = ['yes24_bestseller', 'aladin_bestseller'];
const BOOK_SINGLE_SOURCE_PENALTY = 5;

const TOP_N = 5;
const MAX_RANK = 200;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ── Helpers ──────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')  // remove parenthesized text
    .replace(/[^\p{L}\p{N}]/gu, '') // keep only letters and digits
    .trim();
}

function buildMusicKey(meta: Record<string, unknown>): string {
  const title = normalize(String(meta.title ?? ''));
  const artist = normalize(String(meta.artist ?? ''));
  return `${title}||${artist}`;
}

function buildBookKey(meta: Record<string, unknown>): string {
  const title = normalize(String(meta.title ?? ''));
  const author = normalize(String(meta.author ?? ''));
  return `${title}||${author}`;
}

function pickThumbnail(
  entries: { sourceKey: string; thumbnail: string | null }[],
  priority: string[],
): string | null {
  for (const src of priority) {
    const entry = entries.find(e => e.sourceKey === src && e.thumbnail);
    if (entry) return entry.thumbnail;
  }
  return entries.find(e => e.thumbnail)?.thumbnail ?? null;
}

// ── Merge: Music (Borda count) ───────────────────────

interface MusicCandidate {
  key: string;
  title: string;
  artist: string;
  url: string;
  entries: { sourceKey: string; rank: number; thumbnail: string | null; url: string; metadata: Record<string, unknown> }[];
  bordaScore: number;
}

function mergeMusic(posts: RawPost[]): UnifiedItem[] {
  const grouped = new Map<string, MusicCandidate>();

  for (const post of posts) {
    const m = post.metadata;
    if (!m || typeof m.rank !== 'number') continue;

    const key = buildMusicKey(m);
    if (!key || key === '||') continue;

    const existing = grouped.get(key);
    const entry = {
      sourceKey: post.source_key,
      rank: m.rank as number,
      thumbnail: post.thumbnail,
      url: post.url,
      metadata: m,
    };

    if (existing) {
      existing.entries.push(entry);
    } else {
      grouped.set(key, {
        key,
        title: String(m.title ?? post.title),
        artist: String(m.artist ?? ''),
        url: post.url,
        entries: [entry],
        bordaScore: 0,
      });
    }
  }

  // Calculate Borda scores
  for (const candidate of grouped.values()) {
    let score = 0;
    for (const entry of candidate.entries) {
      const weight = MUSIC_WEIGHTS[entry.sourceKey] ?? 1.0;
      score += (MAX_RANK + 1 - entry.rank) * weight;
    }
    candidate.bordaScore = score;
    // Pick best URL (highest-weighted source)
    const best = [...candidate.entries].sort(
      (a, b) => (MUSIC_WEIGHTS[b.sourceKey] ?? 1) - (MUSIC_WEIGHTS[a.sourceKey] ?? 1),
    )[0];
    candidate.url = best.url;
  }

  const sorted = [...grouped.values()].sort((a, b) => b.bordaScore - a.bordaScore);

  return sorted.slice(0, TOP_N).map((c, i) => ({
    unifiedRank: i + 1,
    title: c.title,
    subtitle: c.artist,
    thumbnail: pickThumbnail(c.entries, MUSIC_THUMB_PRIORITY),
    url: c.url,
    sourceCount: c.entries.length,
    metadata: { bordaScore: Math.round(c.bordaScore * 10) / 10, rankChange: c.entries[0]?.metadata.rankChange },
  }));
}

// ── Merge: Books (average rank) ──────────────────────

interface BookCandidate {
  key: string;
  title: string;
  author: string;
  url: string;
  entries: { sourceKey: string; rank: number; thumbnail: string | null; url: string; metadata: Record<string, unknown> }[];
  avgRank: number;
}

function mergeBooks(posts: RawPost[]): UnifiedItem[] {
  const grouped = new Map<string, BookCandidate>();

  for (const post of posts) {
    const m = post.metadata;
    if (!m || typeof m.rank !== 'number') continue;

    const key = buildBookKey(m);
    if (!key || key === '||') continue;

    const existing = grouped.get(key);
    const entry = {
      sourceKey: post.source_key,
      rank: m.rank as number,
      thumbnail: post.thumbnail,
      url: post.url,
      metadata: m,
    };

    if (existing) {
      existing.entries.push(entry);
    } else {
      grouped.set(key, {
        key,
        title: String(m.title ?? post.title),
        author: String(m.author ?? ''),
        url: post.url,
        entries: [entry],
        avgRank: 0,
      });
    }
  }

  // Calculate average rank with single-source penalty
  for (const candidate of grouped.values()) {
    const ranks = candidate.entries.map(e => e.rank);
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    candidate.avgRank = candidate.entries.length === 1 ? avg + BOOK_SINGLE_SOURCE_PENALTY : avg;
    // Pick best URL
    candidate.url = candidate.entries.sort((a, b) => a.rank - b.rank)[0].url;
  }

  const sorted = [...grouped.values()].sort((a, b) => a.avgRank - b.avgRank);

  return sorted.slice(0, TOP_N).map((c, i) => ({
    unifiedRank: i + 1,
    title: c.title,
    subtitle: c.author,
    thumbnail: pickThumbnail(c.entries, BOOK_THUMB_PRIORITY),
    url: c.url,
    sourceCount: c.entries.length,
    metadata: { avgRank: Math.round(c.avgRank * 10) / 10 },
  }));
}

// ── Pass-through: single-source categories ───────────

function passThroughRanked(posts: RawPost[], extractTitle: (m: Record<string, unknown>) => string, extractSubtitle: (m: Record<string, unknown>) => string): UnifiedItem[] {
  const items: { rank: number; title: string; subtitle: string; thumbnail: string | null; url: string; metadata: Record<string, unknown> }[] = [];

  for (const post of posts) {
    const m = post.metadata;
    if (!m || typeof m.rank !== 'number') continue;
    items.push({
      rank: m.rank as number,
      title: extractTitle(m) || post.title,
      subtitle: extractSubtitle(m),
      thumbnail: post.thumbnail,
      url: post.url,
      metadata: m,
    });
  }

  // Deduplicate by title (in case of overlapping scraper runs)
  const seen = new Set<string>();
  const deduped = items.filter(item => {
    const key = normalize(item.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped
    .sort((a, b) => a.rank - b.rank)
    .slice(0, TOP_N)
    .map((item, i) => ({
      unifiedRank: i + 1,
      title: item.title,
      subtitle: item.subtitle,
      thumbnail: item.thumbnail,
      url: item.url,
      sourceCount: 1,
      metadata: item.metadata,
    }));
}

// ── Route ────────────────────────────────────────────

const unifiedCache = new LRUCache<UnifiedResponse>(1, CACHE_TTL_MS);

export async function entertainmentUnifiedRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: number } }>(
    '/api/entertainment/unified',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
        },
      },
    },
    async (request, reply) => {
      const cached = unifiedCache.get('unified');
      if (cached) return reply.send(cached);

      const { rows } = await app.pg.query<RawPost>(
        `SELECT p.source_key, p.title, p.url, p.thumbnail, p.metadata, p.scraped_at
         FROM posts p
         WHERE p.category IN ('movie', 'performance', 'music', 'books', 'ott')
           AND p.metadata IS NOT NULL
           AND (p.metadata->>'rank') IS NOT NULL
           AND p.scraped_at > NOW() - INTERVAL '48 hours'
         ORDER BY p.source_key, COALESCE((p.metadata->>'rank')::int, 999) ASC`,
      );

      // Group by source_key
      const bySource = new Map<string, RawPost[]>();
      for (const row of rows) {
        const arr = bySource.get(row.source_key) ?? [];
        arr.push(row);
        bySource.set(row.source_key, arr);
      }

      // Get lastUpdated per category
      const { rows: lastUpdatedRows } = await app.pg.query<{ source_key: string; last: string }>(
        `SELECT source_key, MAX(finished_at)::text AS last
         FROM scraper_runs
         WHERE source_key IN ('kobis_boxoffice', 'kopis_boxoffice', 'melon_chart', 'yes24_bestseller', 'flixpatrol')
           AND error_message IS NULL
         GROUP BY source_key`,
      );
      const lastUpdatedMap = new Map(lastUpdatedRows.map(r => [r.source_key, r.last]));

      // ── Movie ──
      const moviePosts = bySource.get('kobis_boxoffice') ?? [];
      const movieItems = passThroughRanked(
        moviePosts,
        m => String(m.movieName ?? ''),
        m => {
          const daily = typeof m.dailyAudience === 'number' ? `일 ${m.dailyAudience.toLocaleString()}명` : '';
          return daily;
        },
      );

      // Movie URLs → Naver search for better UX
      for (const item of movieItems) {
        item.url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(item.title + ' 영화')}`;
      }

      // ── Performance ──
      const perfPosts = bySource.get('kopis_boxoffice') ?? [];
      const perfItems = passThroughRanked(
        perfPosts,
        m => String(m.performanceName ?? ''),
        m => String(m.venue ?? ''),
      );

      // ── Music ──
      const musicPosts: RawPost[] = [];
      for (const src of MUSIC_SOURCES) {
        const posts = bySource.get(src) ?? [];
        musicPosts.push(...posts);
      }
      const musicItems = mergeMusic(musicPosts);

      // ── Books ──
      const bookPosts: RawPost[] = [];
      for (const src of BOOK_SOURCES) {
        const posts = bySource.get(src) ?? [];
        bookPosts.push(...posts);
      }
      const bookItems = mergeBooks(bookPosts);

      // ── OTT ──
      const ottPosts = bySource.get('flixpatrol') ?? [];
      const ottItems = passThroughRanked(
        ottPosts,
        m => String(m.title ?? ''),
        m => String(m.platform ?? ''),
      );

      const result: UnifiedResponse = {
        categories: {
          movie: { items: movieItems, lastUpdated: lastUpdatedMap.get('kobis_boxoffice') ?? null },
          music: { items: musicItems, lastUpdated: lastUpdatedMap.get('melon_chart') ?? null },
          performance: { items: perfItems, lastUpdated: lastUpdatedMap.get('kopis_boxoffice') ?? null },
          books: { items: bookItems, lastUpdated: lastUpdatedMap.get('yes24_bestseller') ?? null },
          ott: { items: ottItems, lastUpdated: lastUpdatedMap.get('flixpatrol') ?? null },
        },
      };

      unifiedCache.set('unified', result);
      return reply.send(result);
    },
  );
}
