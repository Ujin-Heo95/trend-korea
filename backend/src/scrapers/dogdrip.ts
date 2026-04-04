import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class DogdripScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://www.dogdrip.net/dogdrip?sort_index=popular', {
      headers: { Referer: 'https://www.dogdrip.net/' },
    });

    const posts: ScrapedPost[] = [];

    $('li.webzine').each((_, el) => {
      const a = $(el).find('a.title-link[data-document-srl]').first();
      const title = a.text().trim();
      if (!title || title.length < 3) return;

      const href = a.attr('href') ?? '';
      const url = href.startsWith('http')
        ? href
        : `https://www.dogdrip.net${href.split('?')[0]}`;

      const thumbnail = $(el).find('img.webzine-thumbnail').attr('src') || undefined;
      const fullThumbnail = thumbnail && !thumbnail.startsWith('http')
        ? `https://www.dogdrip.net${thumbnail}`
        : thumbnail;

      // Comment count: span right after title-link inside h5
      const commentSpan = a.next('span');
      const commentCount = parseInt(commentSpan.text()) || undefined;

      // Like count: span with fa-thumbs-up sibling
      const likeMeta = $(el).find('.fa-thumbs-up').parent().next('span');
      const likeCount = parseInt(likeMeta.text().trim()) || undefined;

      // Author: member link
      const authorEl = $(el).find('a[class*="member_"]');
      const author = authorEl.text().replace(/^\[.*?\]\s*/, '').trim() || undefined;

      posts.push({
        sourceKey: 'dogdrip',
        sourceName: '개드립',
        title,
        url,
        thumbnail: fullThumbnail,
        author,
        commentCount,
        likeCount,
      });
    });

    return posts.slice(0, 30);
  }
}
