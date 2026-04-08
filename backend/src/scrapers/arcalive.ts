import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

export class ArcaliveScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://arca.live/b/live', {
      headers: {
        Referer: 'https://arca.live/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        Cookie: 'bb_warning_closed=true',
      },
    });

    const posts: ScrapedPost[] = [];

    $('div.vrow.hybrid').each((_, el) => {
      const titleA = $(el).find('a.title.hybrid-title');
      const href = titleA.attr('href') ?? '';
      if (!href || !href.startsWith('/b/')) return;

      const titleText = titleA.contents().filter(function () {
        return this.type === 'text';
      }).text().trim();
      if (!titleText || titleText.length < 2) return;

      const url = `https://arca.live${href.split('?')[0]}`;

      const commentText = titleA.find('.comment-count').text();
      const commentMatch = commentText.match(/\[(\d+)\]/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      const viewCount = parseInt($(el).find('.col-view').text().replace(/,/g, '')) || undefined;
      const likeCount = parseInt($(el).find('.col-rate').text().replace(/,/g, '')) || undefined;

      const author = $(el).find('.user-info span[data-filter]').first().attr('data-filter') || undefined;

      const datetime = $(el).find('time').attr('datetime');
      const publishedAt = datetime ? new Date(datetime) : undefined;

      const thumbnail = $(el).find('.vrow-preview img').attr('src') || undefined;
      const normalizedThumb = thumbnail?.startsWith('//')
        ? `https:${thumbnail.split('?')[0]}`
        : thumbnail;

      const channel = $(el).find('.badge').first().text().trim() || undefined;

      posts.push({
        sourceKey: 'arcalive',
        sourceName: '아카라이브',
        title: titleText,
        url,
        author,
        viewCount,
        commentCount,
        likeCount,
        publishedAt,
        thumbnail: normalizedThumb,
        contentSnippet: channel ? `[${channel}]` : undefined,
      });
    });

    return posts.slice(0, 30);
  }
}
