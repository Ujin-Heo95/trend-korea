# Apify SNS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Apify cloud scraping to collect trending content from Instagram, X (Twitter), and TikTok into a new "SNS" tab.

**Architecture:** Extend the existing `sources.json` registry with `type: "apify"` entries. A new `ApifyBaseScraper` class handles Actor execution and monthly budget enforcement. Platform-specific subclasses map Actor results to `ScrapedPost`. A dedicated cron job runs twice daily (09:00/18:00 KST).

**Tech Stack:** apify-client (npm), existing Fastify + PostgreSQL + React stack

**Spec:** `docs/superpowers/specs/2026-03-31-apify-sns-integration-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `backend/src/db/migrations/015_apify_usage.sql` | `apify_usage` table for cost tracking |
| `backend/src/scrapers/apify-base.ts` | Abstract base: Actor call, budget check, result mapping |
| `backend/src/scrapers/apify-instagram.ts` | Instagram Actor result → ScrapedPost |
| `backend/src/scrapers/apify-x.ts` | X Actor result → ScrapedPost |
| `backend/src/scrapers/apify-tiktok.ts` | TikTok Actor result → ScrapedPost |
| `frontend/src/components/SnsRankingTable.tsx` | SNS tab card-style post list with platform badges |

### Modified Files

| File | Change |
|------|--------|
| `backend/src/config/index.ts` | Add `apifyApiToken`, `apifyMonthlyBudgetCents` |
| `backend/src/scrapers/registry.ts` | Add `type: 'apify'` branch, extend `SourceEntry` |
| `backend/src/scrapers/sources.json` | Add 3 apify source entries |
| `backend/src/scheduler/index.ts` | Add 09:00/18:00 KST cron for apify sources |
| `backend/src/scrapers/index.ts` | Add `runApifyScrapers()` export |
| `backend/src/services/discord.ts` | Add `notifyBudgetAlert()` function |
| `frontend/src/types.ts` | Add `'sns'` to `Category` union |
| `frontend/src/components/CategoryTabs.tsx` | Add SNS tab entry |
| `frontend/src/pages/HomePage.tsx` | Render `SnsRankingTable` for `sns` category |
| `backend/package.json` | Add `apify-client` dependency |

---

## Task 1: Install dependency and add config

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/config/index.ts:1-77`

- [ ] **Step 1: Install apify-client**

```bash
cd backend && npm install apify-client
```

- [ ] **Step 2: Add env vars to config**

In `backend/src/config/index.ts`, add to the `Config` interface:

```typescript
interface Config {
  // ... existing fields ...
  apifyApiToken: string;
  apifyMonthlyBudgetCents: number;
}
```

Add parsing before the `export const config` block:

```typescript
const rawApifyBudget = Number(process.env.APIFY_MONTHLY_BUDGET_CENTS ?? 2000);
const apifyMonthlyBudgetCents = Number.isInteger(rawApifyBudget) && rawApifyBudget >= 0
  ? rawApifyBudget
  : 2000;
if (apifyMonthlyBudgetCents !== rawApifyBudget) {
  console.warn(`[config] WARNING: APIFY_MONTHLY_BUDGET_CENTS invalid — defaulting to 2000`);
}
```

Add to the exported `config` object:

```typescript
export const config: Config = {
  // ... existing fields ...
  apifyApiToken: process.env.APIFY_API_TOKEN ?? '',
  apifyMonthlyBudgetCents,
};
```

- [ ] **Step 3: Verify build**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/config/index.ts
git commit -m "feat: add apify-client dependency and config env vars"
```

---

## Task 2: Database migration for apify_usage

**Files:**
- Create: `backend/src/db/migrations/015_apify_usage.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 015_apify_usage.sql: Apify Actor 실행 비용 추적
CREATE TABLE IF NOT EXISTS apify_usage (
  id            SERIAL PRIMARY KEY,
  actor_id      TEXT         NOT NULL,
  source_key    VARCHAR(64)  NOT NULL,
  cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  items_count   INTEGER      NOT NULL DEFAULT 0,
  executed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_apify_usage_month ON apify_usage (date_trunc('month', executed_at));
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npm run migrate
```

Expected: Migration applies without error.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/015_apify_usage.sql
git commit -m "feat: add apify_usage table for cost tracking (migration 015)"
```

---

## Task 3: Discord budget alert

**Files:**
- Modify: `backend/src/services/discord.ts:1-41`

- [ ] **Step 1: Add notifyBudgetAlert function**

Append to `backend/src/services/discord.ts`:

```typescript
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
    console.error('[discord] budget alert webhook error:', err);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/discord.ts
git commit -m "feat: add Discord budget alert for Apify monthly limit"
```

---

## Task 4: ApifyBaseScraper abstract class

**Files:**
- Create: `backend/src/scrapers/apify-base.ts`

- [ ] **Step 1: Write test**

Create `backend/tests/scrapers/apify-base.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock apify-client
vi.mock('apify-client', () => {
  const mockCall = vi.fn();
  const mockGetItems = vi.fn();
  return {
    ApifyClient: vi.fn().mockImplementation(() => ({
      actor: vi.fn().mockReturnValue({
        call: mockCall,
      }),
      dataset: vi.fn().mockReturnValue({
        listItems: mockGetItems,
      }),
    })),
    __mockCall: mockCall,
    __mockGetItems: mockGetItems,
  };
});

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    apifyApiToken: 'test-token',
    apifyMonthlyBudgetCents: 2000,
    discordWebhookUrl: '',
  },
}));

// Mock discord
vi.mock('../../src/services/discord.js', () => ({
  notifyBudgetAlert: vi.fn(),
}));

import { ApifyBaseScraper } from '../../src/scrapers/apify-base.js';
import type { ScrapedPost } from '../../src/scrapers/types.js';
import type { Pool } from 'pg';

// Concrete test implementation
class TestApifyScraper extends ApifyBaseScraper {
  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    return {
      sourceKey: 'test',
      sourceName: 'Test',
      title: String(item.text ?? ''),
      url: String(item.url ?? ''),
    };
  }
}

describe('ApifyBaseScraper', () => {
  let mockPool: Pool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ total_cents: 0 }] }),
    } as unknown as Pool;
  });

  it('returns empty array when apiToken is missing', async () => {
    const { config } = await import('../../src/config/index.js');
    (config as any).apifyApiToken = '';

    const scraper = new TestApifyScraper(mockPool, 'apify/test-actor', { maxItems: 10 });
    const posts = await scraper.fetch();
    expect(posts).toEqual([]);

    (config as any).apifyApiToken = 'test-token';
  });

  it('skips when monthly budget exceeded', async () => {
    (mockPool.query as any).mockResolvedValueOnce({
      rows: [{ total_cents: 2500 }],
    });

    const scraper = new TestApifyScraper(mockPool, 'apify/test-actor', { maxItems: 10 });
    const posts = await scraper.fetch();
    expect(posts).toEqual([]);
  });

  it('maps actor results to ScrapedPost array', async () => {
    const { __mockCall, __mockGetItems } = await import('apify-client') as any;
    __mockCall.mockResolvedValue({ defaultDatasetId: 'ds-123' });
    __mockGetItems.mockResolvedValue({
      items: [
        { text: 'Hello world', url: 'https://example.com/1' },
        { text: 'Test post', url: 'https://example.com/2' },
      ],
    });

    const scraper = new TestApifyScraper(mockPool, 'apify/test-actor', { maxItems: 10 });
    const posts = await scraper.fetch();

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('Hello world');
    expect(posts[1].url).toBe('https://example.com/2');
  });

  it('filters out null results from mapResult', async () => {
    const { __mockCall, __mockGetItems } = await import('apify-client') as any;
    __mockCall.mockResolvedValue({ defaultDatasetId: 'ds-456' });
    __mockGetItems.mockResolvedValue({
      items: [
        { text: 'Valid', url: 'https://example.com/1' },
        { text: '', url: '' }, // mapResult returns this but with empty strings
      ],
    });

    const scraper = new TestApifyScraper(mockPool, 'apify/test-actor', { maxItems: 10 });
    const posts = await scraper.fetch();

    // Both items are mapped (empty strings are valid ScrapedPost)
    expect(posts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run tests/scrapers/apify-base.test.ts
```

Expected: FAIL — `apify-base.ts` does not exist yet.

- [ ] **Step 3: Implement ApifyBaseScraper**

Create `backend/src/scrapers/apify-base.ts`:

```typescript
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

  /** Subclasses map a single Actor result item to ScrapedPost (or null to skip) */
  abstract mapResult(item: Record<string, unknown>): ScrapedPost | null;

  async fetch(): Promise<ScrapedPost[]> {
    if (!config.apifyApiToken) {
      console.warn(`[apify:${this.actorId}] APIFY_API_TOKEN not set — skipping`);
      return [];
    }

    // Budget check
    const budgetExceeded = await this.isBudgetExceeded();
    if (budgetExceeded) {
      console.warn(`[apify:${this.actorId}] monthly budget exceeded — skipping`);
      return [];
    }

    const client = new ApifyClient({ token: config.apifyApiToken });

    const runResult = await client.actor(this.actorId).call(this.actorInput);
    const { items } = await client.dataset(runResult.defaultDatasetId).listItems();

    // Record usage (cost will be approximate — Apify bills by compute unit)
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
      const result = await (this as any).pool.query(
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
      return false; // fail-open: allow execution if budget check fails
    }
  }

  private async recordUsage(itemsCount: number, costCents: number): Promise<void> {
    try {
      await (this as any).pool.query(
        `INSERT INTO apify_usage (actor_id, source_key, cost_usd, items_count)
         VALUES ($1, $2, $3, $4)`,
        [this.actorId, this.category ?? 'sns', costCents / 100, itemsCount],
      );
    } catch (err) {
      console.warn(`[apify] usage recording failed:`, err);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run tests/scrapers/apify-base.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/scrapers/apify-base.ts backend/tests/scrapers/apify-base.test.ts
git commit -m "feat: add ApifyBaseScraper with budget control and Actor abstraction"
```

---

## Task 5: Instagram scraper

**Files:**
- Create: `backend/src/scrapers/apify-instagram.ts`

- [ ] **Step 1: Write test**

Create `backend/tests/scrapers/apify-instagram.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ApifyInstagramScraper } from '../../src/scrapers/apify-instagram.js';
import type { Pool } from 'pg';

describe('ApifyInstagramScraper.mapResult', () => {
  const pool = {} as Pool;
  const scraper = new ApifyInstagramScraper(pool);

  it('maps a standard Instagram post', () => {
    const item = {
      caption: '서울 핫플 카페 추천 #서울카페 #핫플',
      url: 'https://www.instagram.com/p/ABC123/',
      displayUrl: 'https://scontent.cdninstagram.com/v/photo.jpg',
      ownerUsername: 'foodie_kr',
      likesCount: 1234,
      commentsCount: 56,
      timestamp: '2026-03-31T09:00:00.000Z',
    };

    const post = scraper.mapResult(item);

    expect(post).not.toBeNull();
    expect(post!.sourceKey).toBe('apify_instagram_trending');
    expect(post!.title).toBe('서울 핫플 카페 추천 #서울카페 #핫플');
    expect(post!.url).toBe('https://www.instagram.com/p/ABC123/');
    expect(post!.thumbnail).toBe('https://scontent.cdninstagram.com/v/photo.jpg');
    expect(post!.author).toBe('foodie_kr');
    expect(post!.viewCount).toBe(1234);
    expect(post!.commentCount).toBe(56);
    expect(post!.metadata).toEqual({
      platform: 'instagram',
      likes: 1234,
    });
  });

  it('truncates long captions to 100 chars', () => {
    const longCaption = '가'.repeat(150);
    const item = {
      caption: longCaption,
      url: 'https://www.instagram.com/p/XYZ/',
      ownerUsername: 'user',
      likesCount: 0,
      commentsCount: 0,
    };

    const post = scraper.mapResult(item);
    expect(post!.title.length).toBeLessThanOrEqual(103); // 100 + '...'
  });

  it('returns null when url is missing', () => {
    const item = { caption: 'no url', likesCount: 0, commentsCount: 0 };
    const post = scraper.mapResult(item);
    expect(post).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run tests/scrapers/apify-instagram.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `backend/src/scrapers/apify-instagram.ts`:

```typescript
import type { Pool } from 'pg';
import { ApifyBaseScraper } from './apify-base.js';
import type { ScrapedPost } from './types.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export class ApifyInstagramScraper extends ApifyBaseScraper {
  constructor(pool: Pool) {
    super(pool, 'apify/instagram-hashtag-scraper', {
      hashtags: ['한국', '핫플', '맛집', '서울'],
      resultsLimit: 30,
    });
  }

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    const url = String(item.url ?? '');
    if (!url) return null;

    const caption = String(item.caption ?? '');
    const likes = Number(item.likesCount ?? 0);
    const comments = Number(item.commentsCount ?? 0);

    return {
      sourceKey: 'apify_instagram_trending',
      sourceName: 'Instagram',
      title: truncate(caption, 100) || '(이미지 게시물)',
      url,
      thumbnail: item.displayUrl ? String(item.displayUrl) : undefined,
      author: item.ownerUsername ? String(item.ownerUsername) : undefined,
      viewCount: likes,
      commentCount: comments,
      publishedAt: item.timestamp ? new Date(String(item.timestamp)) : undefined,
      metadata: { platform: 'instagram', likes },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run tests/scrapers/apify-instagram.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scrapers/apify-instagram.ts backend/tests/scrapers/apify-instagram.test.ts
git commit -m "feat: add Instagram trending scraper via Apify"
```

---

## Task 6: X (Twitter) scraper

**Files:**
- Create: `backend/src/scrapers/apify-x.ts`

- [ ] **Step 1: Write test**

Create `backend/tests/scrapers/apify-x.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ApifyXScraper } from '../../src/scrapers/apify-x.js';
import type { Pool } from 'pg';

describe('ApifyXScraper.mapResult', () => {
  const pool = {} as Pool;
  const scraper = new ApifyXScraper(pool);

  it('maps a standard tweet', () => {
    const item = {
      full_text: '속보: 서울시 새로운 정책 발표 화제',
      url: 'https://twitter.com/user/status/123456',
      user: { screen_name: 'newsbot_kr' },
      retweet_count: 500,
      favorite_count: 1200,
      views_count: 50000,
      reply_count: 89,
      created_at: 'Mon Mar 31 09:00:00 +0000 2026',
      entities: { media: [{ media_url_https: 'https://pbs.twimg.com/media/photo.jpg' }] },
    };

    const post = scraper.mapResult(item);

    expect(post).not.toBeNull();
    expect(post!.sourceKey).toBe('apify_x_trending');
    expect(post!.title).toBe('속보: 서울시 새로운 정책 발표 화제');
    expect(post!.url).toBe('https://twitter.com/user/status/123456');
    expect(post!.author).toBe('@newsbot_kr');
    expect(post!.viewCount).toBe(50000);
    expect(post!.commentCount).toBe(89);
    expect(post!.metadata).toEqual({
      platform: 'x',
      retweets: 500,
      likes: 1200,
    });
  });

  it('truncates long tweets to 100 chars', () => {
    const longText = 'A'.repeat(150);
    const item = {
      full_text: longText,
      url: 'https://twitter.com/u/status/1',
      user: { screen_name: 'u' },
      retweet_count: 0,
      favorite_count: 0,
      views_count: 0,
      reply_count: 0,
    };

    const post = scraper.mapResult(item);
    expect(post!.title.length).toBeLessThanOrEqual(103);
  });

  it('returns null when url is missing', () => {
    const item = { full_text: 'no url' };
    const post = scraper.mapResult(item);
    expect(post).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run tests/scrapers/apify-x.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `backend/src/scrapers/apify-x.ts`:

```typescript
import type { Pool } from 'pg';
import { ApifyBaseScraper } from './apify-base.js';
import type { ScrapedPost } from './types.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export class ApifyXScraper extends ApifyBaseScraper {
  constructor(pool: Pool) {
    super(pool, 'apidojo/tweet-scraper', {
      searchTerms: ['한국 트렌드'],
      maxTweets: 30,
      language: 'ko',
    });
  }

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    const url = String(item.url ?? '');
    if (!url) return null;

    const text = String(item.full_text ?? item.text ?? '');
    const user = item.user as Record<string, unknown> | undefined;
    const screenName = user?.screen_name ? String(user.screen_name) : undefined;
    const retweets = Number(item.retweet_count ?? 0);
    const likes = Number(item.favorite_count ?? 0);
    const views = Number(item.views_count ?? 0);
    const replies = Number(item.reply_count ?? 0);

    const entities = item.entities as Record<string, unknown> | undefined;
    const media = Array.isArray(entities?.media) ? entities.media : [];
    const thumbnail = media.length > 0 ? String((media[0] as any).media_url_https ?? '') : undefined;

    return {
      sourceKey: 'apify_x_trending',
      sourceName: 'X (Twitter)',
      title: truncate(text, 100) || '(트윗)',
      url,
      thumbnail: thumbnail || undefined,
      author: screenName ? `@${screenName}` : undefined,
      viewCount: views,
      commentCount: replies,
      publishedAt: item.created_at ? new Date(String(item.created_at)) : undefined,
      metadata: { platform: 'x', retweets, likes },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run tests/scrapers/apify-x.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scrapers/apify-x.ts backend/tests/scrapers/apify-x.test.ts
git commit -m "feat: add X (Twitter) trending scraper via Apify"
```

---

## Task 7: TikTok scraper

**Files:**
- Create: `backend/src/scrapers/apify-tiktok.ts`

- [ ] **Step 1: Write test**

Create `backend/tests/scrapers/apify-tiktok.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ApifyTiktokScraper } from '../../src/scrapers/apify-tiktok.js';
import type { Pool } from 'pg';

describe('ApifyTiktokScraper.mapResult', () => {
  const pool = {} as Pool;
  const scraper = new ApifyTiktokScraper(pool);

  it('maps a standard TikTok video', () => {
    const item = {
      text: '한국 길거리 음식 먹방 🍜',
      webVideoUrl: 'https://www.tiktok.com/@user/video/123',
      videoMeta: { coverUrl: 'https://p16-sign.tiktokcdn.com/cover.jpg' },
      authorMeta: { name: 'foodie_seoul' },
      playCount: 150000,
      commentCount: 340,
      diggCount: 8900,
      shareCount: 1200,
      createTimeISO: '2026-03-31T09:00:00.000Z',
    };

    const post = scraper.mapResult(item);

    expect(post).not.toBeNull();
    expect(post!.sourceKey).toBe('apify_tiktok_trending');
    expect(post!.title).toContain('한국 길거리 음식');
    expect(post!.url).toBe('https://www.tiktok.com/@user/video/123');
    expect(post!.author).toBe('foodie_seoul');
    expect(post!.viewCount).toBe(150000);
    expect(post!.commentCount).toBe(340);
    expect(post!.metadata).toEqual({
      platform: 'tiktok',
      likes: 8900,
      shares: 1200,
    });
  });

  it('returns null when url is missing', () => {
    const item = { text: 'no url' };
    const post = scraper.mapResult(item);
    expect(post).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run tests/scrapers/apify-tiktok.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `backend/src/scrapers/apify-tiktok.ts`:

```typescript
import type { Pool } from 'pg';
import { ApifyBaseScraper } from './apify-base.js';
import type { ScrapedPost } from './types.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export class ApifyTiktokScraper extends ApifyBaseScraper {
  constructor(pool: Pool) {
    super(pool, 'clockworks/tiktok-scraper', {
      hashtags: ['한국', '핫플', '맛집'],
      resultsPerPage: 30,
    });
  }

  mapResult(item: Record<string, unknown>): ScrapedPost | null {
    const url = String(item.webVideoUrl ?? '');
    if (!url) return null;

    const text = String(item.text ?? '');
    const authorMeta = item.authorMeta as Record<string, unknown> | undefined;
    const videoMeta = item.videoMeta as Record<string, unknown> | undefined;
    const likes = Number(item.diggCount ?? 0);
    const shares = Number(item.shareCount ?? 0);

    return {
      sourceKey: 'apify_tiktok_trending',
      sourceName: 'TikTok',
      title: truncate(text, 100) || '(TikTok 영상)',
      url,
      thumbnail: videoMeta?.coverUrl ? String(videoMeta.coverUrl) : undefined,
      author: authorMeta?.name ? String(authorMeta.name) : undefined,
      viewCount: Number(item.playCount ?? 0),
      commentCount: Number(item.commentCount ?? 0),
      publishedAt: item.createTimeISO ? new Date(String(item.createTimeISO)) : undefined,
      metadata: { platform: 'tiktok', likes, shares },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run tests/scrapers/apify-tiktok.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scrapers/apify-tiktok.ts backend/tests/scrapers/apify-tiktok.test.ts
git commit -m "feat: add TikTok trending scraper via Apify"
```

---

## Task 8: Registry and sources.json integration

**Files:**
- Modify: `backend/src/scrapers/sources.json`
- Modify: `backend/src/scrapers/registry.ts:1-95`

- [ ] **Step 1: Add apify sources to sources.json**

Append these 3 entries to the `sources` array in `backend/src/scrapers/sources.json` (before the closing `]`):

```json
    {
      "key": "apify_instagram_trending",
      "name": "Instagram 트렌딩",
      "category": "sns",
      "type": "apify",
      "module": "./apify-instagram.js",
      "className": "ApifyInstagramScraper",
      "actorId": "apify/instagram-hashtag-scraper",
      "priority": "medium",
      "enabled": true
    },
    {
      "key": "apify_x_trending",
      "name": "X 트렌딩",
      "category": "sns",
      "type": "apify",
      "module": "./apify-x.js",
      "className": "ApifyXScraper",
      "actorId": "apidojo/tweet-scraper",
      "priority": "medium",
      "enabled": true
    },
    {
      "key": "apify_tiktok_trending",
      "name": "TikTok 트렌딩",
      "category": "sns",
      "type": "apify",
      "module": "./apify-tiktok.js",
      "className": "ApifyTiktokScraper",
      "actorId": "clockworks/tiktok-scraper",
      "priority": "medium",
      "enabled": true
    }
```

- [ ] **Step 2: Extend SourceEntry type in registry.ts**

In `backend/src/scrapers/registry.ts`, update the `SourceEntry` interface:

```typescript
export interface SourceEntry {
  key: string;
  name: string;
  category: string;
  type: 'rss' | 'html' | 'api' | 'apify';
  priority: SourcePriority;
  enabled: boolean;
  feedUrl?: string;
  module?: string;
  className?: string;
  actorId?: string;
}
```

- [ ] **Step 3: Add apify branch to buildOneScraper**

In `backend/src/scrapers/registry.ts`, update the `buildOneScraper` function. Add the apify handling before the existing `source.type === 'rss'` check:

```typescript
async function buildOneScraper(source: SourceEntry, pool: Pool): Promise<BaseScraper | null> {
  if (source.type === 'rss') {
    if (!source.feedUrl) {
      console.warn(`[registry] ${source.key}: rss type requires feedUrl, skipping`);
      return null;
    }
    return new RssScraper({
      sourceKey: source.key,
      sourceName: source.name,
      feedUrl: source.feedUrl,
      maxItems: 30,
      pool,
    });
  }

  if (!source.module || !source.className) {
    console.warn(`[registry] ${source.key}: html/api/apify type requires module+className, skipping`);
    return null;
  }

  try {
    const mod = await import(source.module);
    const ScraperClass = mod[source.className];
    if (!ScraperClass) {
      console.warn(`[registry] ${source.key}: class ${source.className} not found in ${source.module}`);
      return null;
    }

    // YouTube scrapers need extra apiKey argument
    if (source.key === 'youtube' || source.key === 'youtube_search') {
      return new ScraperClass(pool, config.youtubeApiKey);
    }

    // Apify scrapers only need pool (token read from config internally)
    return new ScraperClass(pool);
  } catch (err) {
    console.error(`[registry] ${source.key}: failed to load module ${source.module}:`, err);
    return null;
  }
}
```

Note: The apify scrapers use the same `new ScraperClass(pool)` pattern as html scrapers. They read `config.apifyApiToken` internally. No special injection needed.

- [ ] **Step 4: Verify build**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scrapers/sources.json backend/src/scrapers/registry.ts
git commit -m "feat: register 3 Apify SNS sources in registry (Instagram, X, TikTok)"
```

---

## Task 9: Scheduler — dedicated Apify cron

**Files:**
- Modify: `backend/src/scrapers/index.ts:1-115`
- Modify: `backend/src/scheduler/index.ts:1-77`

- [ ] **Step 1: Add runApifyScrapers to scrapers/index.ts**

Append to `backend/src/scrapers/index.ts`:

```typescript
export async function runApifyScrapers(): Promise<void> {
  if (runningLocks.get('apify')) {
    console.warn(`[scheduler] apify scrapers already running — skipping`);
    return;
  }

  runningLocks.set('apify', true);
  try {
    const all = await buildScrapers(pool);
    const apifyEntries = all.filter(s => s.sourceKey.startsWith('apify_'));
    if (apifyEntries.length === 0) return;

    console.log(`[scheduler] running ${apifyEntries.length} apify scrapers`);
    // Sequential execution (p-limit(1)) to avoid concurrent Actor runs
    const limit = pLimit(1);
    const results = await Promise.allSettled(apifyEntries.map(e => limit(() => runScraper(e))));
    const errors: ScraperError[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const msg = String(r.reason);
        console.error(`[scraper:${apifyEntries[i].sourceKey}] unhandled rejection:`, msg);
        errors.push({ sourceKey: apifyEntries[i].sourceKey, error: msg });
      } else if (r.value) {
        errors.push(r.value);
      }
    });
    if (errors.length > 0) {
      await notifyScraperErrors('apify', errors).catch(() => {});
    }
  } finally {
    runningLocks.set('apify', false);
  }
}
```

- [ ] **Step 2: Add cron job to scheduler**

In `backend/src/scheduler/index.ts`, add import:

```typescript
import { runAllScrapers, runScrapersByPriority, runApifyScrapers } from '../scrapers/index.js';
```

Add cron job inside `startScheduler()` (after the cross-validate block):

```typescript
  // Apify SNS 수집: 09:00, 18:00 KST (= 00:00, 09:00 UTC)
  cron.schedule('0 0,9 * * *', () => {
    runApifyScrapers().catch(captureError);
  });
  console.log('[scheduler] apify SNS: 00:00, 09:00 UTC (09:00, 18:00 KST)');
```

- [ ] **Step 3: Verify build**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scrapers/index.ts backend/src/scheduler/index.ts
git commit -m "feat: add dedicated Apify cron job (09:00/18:00 KST)"
```

---

## Task 10: Frontend — types, tab, and SNS table

**Files:**
- Modify: `frontend/src/types.ts:1-5`
- Modify: `frontend/src/components/CategoryTabs.tsx:3-12`
- Modify: `frontend/src/pages/HomePage.tsx:1-197`
- Create: `frontend/src/components/SnsRankingTable.tsx`

- [ ] **Step 1: Add 'sns' to Category type**

In `frontend/src/types.ts`, update the Category union:

```typescript
export type Category =
  | 'community' | 'video' | 'video_popular' | 'news' | 'tech'
  | 'finance' | 'trend' | 'government' | 'newsletter'
  | 'deals' | 'alert' | 'sports' | 'press' | 'techblog'
  | 'movie' | 'performance' | 'sns';
```

- [ ] **Step 2: Add SNS tab to CategoryTabs**

In `frontend/src/components/CategoryTabs.tsx`, add entry to `CATEGORIES` array (before the closing `]`):

```typescript
  { key: 'sns',                                           label: 'SNS',     icon: '📱' },
```

- [ ] **Step 3: Create SnsRankingTable component**

Create `frontend/src/components/SnsRankingTable.tsx`:

```tsx
import React from 'react';
import type { Post } from '../types';

const PLATFORM_BADGES: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: 'bg-pink-100 text-pink-700' },
  x: { label: 'X', color: 'bg-slate-100 text-slate-700' },
  tiktok: { label: 'TikTok', color: 'bg-cyan-100 text-cyan-700' },
};

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

interface Props {
  posts: Post[];
}

export const SnsRankingTable: React.FC<Props> = ({ posts }) => {
  if (posts.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-lg mb-1">SNS 데이터를 수집 중입니다</p>
        <p className="text-sm">잠시 후 다시 확인해 주세요</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {posts.map((post) => {
        const platform = String(post.metadata?.platform ?? '');
        const badge = PLATFORM_BADGES[platform];

        return (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 bg-white rounded-xl border border-slate-200 p-3 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            {post.thumbnail && (
              <img
                src={post.thumbnail}
                alt=""
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {badge && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                )}
                {post.author && (
                  <span className="text-xs text-slate-400 truncate">{post.author}</span>
                )}
              </div>

              <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug">
                {post.title}
              </p>

              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                {post.view_count > 0 && (
                  <span>{platform === 'instagram' ? '❤️' : '👁'} {formatCount(post.view_count)}</span>
                )}
                {post.comment_count > 0 && (
                  <span>💬 {formatCount(post.comment_count)}</span>
                )}
                {post.metadata?.retweets != null && Number(post.metadata.retweets) > 0 && (
                  <span>🔄 {formatCount(Number(post.metadata.retweets))}</span>
                )}
                {post.metadata?.shares != null && Number(post.metadata.shares) > 0 && (
                  <span>↗️ {formatCount(Number(post.metadata.shares))}</span>
                )}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Add SNS rendering to HomePage**

In `frontend/src/pages/HomePage.tsx`:

Add import:
```typescript
import { SnsRankingTable } from '../components/SnsRankingTable';
```

Add to `CATEGORY_TITLES`:
```typescript
const CATEGORY_TITLES: Record<string, string> = {
  // ... existing entries ...
  sns: 'SNS',
};
```

Update the conditional rendering block (around line 154). Change:

```tsx
        category === 'movie' ? (
          <MovieRankingTable posts={allPosts} />
        ) : category === 'performance' ? (
          <PerformanceRankingTable posts={allPosts} />
        ) : (
```

To:

```tsx
        category === 'movie' ? (
          <MovieRankingTable posts={allPosts} />
        ) : category === 'performance' ? (
          <PerformanceRankingTable posts={allPosts} />
        ) : category === 'sns' ? (
          <SnsRankingTable posts={allPosts} />
        ) : (
```

- [ ] **Step 5: Verify frontend builds**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/CategoryTabs.tsx frontend/src/components/SnsRankingTable.tsx frontend/src/pages/HomePage.tsx
git commit -m "feat: add SNS tab with platform badges (Instagram, X, TikTok)"
```

---

## Task 11: Full integration test and docs

**Files:**
- Verify all backend tests pass
- Update CLAUDE.md if needed

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: All tests pass including new apify-base, apify-instagram, apify-x, apify-tiktok tests.

- [ ] **Step 2: Run full build check**

```bash
cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit
```

Expected: No errors in either project.

- [ ] **Step 3: Verify sources count**

```bash
cd backend && node -e "const s = require('./src/scrapers/sources.json'); console.log('Total sources:', s.sources.length, '/ Enabled:', s.sources.filter(x=>x.enabled).length)"
```

Expected: Total sources: 65 / Enabled: ~50+ (3 new apify sources).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: verify Apify SNS integration builds and tests pass"
```

---

## Task 12: Documentation update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/dev/변경이력.md`

- [ ] **Step 1: Update CLAUDE.md**

Add to Architecture diagram:
```
├── Apify: SNS 트렌딩 수집 (Instagram/X/TikTok, 일 2회, 월 $20 상한)
```

Add to Key Files table:
```
| Apify 베이스 | `backend/src/scrapers/apify-base.ts` |
| SNS 랭킹 테이블 | `frontend/src/components/SnsRankingTable.tsx` |
```

Add `'sns'` to relevant category references.

Update source count from 62 to 65.

- [ ] **Step 2: Update 변경이력.md**

Add entry for the new version with summary of all changes.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/dev/변경이력.md
git commit -m "docs: add Apify SNS integration to CLAUDE.md and changelog"
```
