import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml, parseKoreanDate } from './http-utils.js';

export class GeeknewsScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://news.hada.io/', {
      headers: { Referer: 'https://news.hada.io/' },
    });

    const posts: ScrapedPost[] = [];

    $('div.topic_row').each((_, el) => {
      const titleEl = $(el).find('div.topictitle a').first();
      const h1 = titleEl.find('h1');
      const title = (h1.length ? h1.text() : titleEl.text()).trim();
      if (!title || title.length < 5) return;

      const href = titleEl.attr('href') ?? '';
      if (!href) return;

      const url = href.startsWith('http')
        ? href
        : `https://news.hada.io/${href.replace(/^\//, '')}`;

      const infoText = $(el).find('div.topicinfo').text();
      const pointsMatch = $(el).find('div.topicinfo span[id^="tp"]').text().trim();
      const likeCount = parseInt(pointsMatch) || undefined;

      const commentMatch = infoText.match(/댓글\s*(\d+)/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;

      const authorEl = $(el).find('div.topicinfo a[href*="/user?id="]').first();
      const author = authorEl.text().trim() || undefined;

      const viewCount = likeCount; // GeekNews에서 포인트 수 = 사실상 조회 관심도 지표
      const timeText = infoText.match(/(\d+[smhd])\s|(\d+\s*(seconds?|minutes?|hours?|days?)\s*ago)/i);
      const publishedAt = timeText ? parseKoreanDate(timeText[0].trim()) : undefined;
      posts.push({
        sourceKey: 'geeknews',
        sourceName: 'GeekNews',
        title,
        url,
        author,
        viewCount,
        commentCount,
        likeCount,
        publishedAt,
        category: 'tech',
      });
    });

    return posts.slice(0, 30);
  }
}
