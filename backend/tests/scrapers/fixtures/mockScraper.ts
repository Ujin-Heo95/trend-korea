import type { Pool } from 'pg';
import { BaseScraper } from '../../../src/scrapers/base.js';
import type { ScrapedPost } from '../../../src/scrapers/types.js';

export class MockScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    return [];
  }
}
