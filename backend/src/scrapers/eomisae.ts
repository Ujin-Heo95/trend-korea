import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { fetchHtml } from './http-utils.js';

function extractCountAfterIcon(html: string, iconClass: string): number | undefined {
  const regex = new RegExp(`<i[^>]*class="[^"]*${iconClass}[^"]*"[^>]*></i>\\s*(\\d[\\d,]*)`, 'i');
  const match = html.match(regex);
  return match ? parseInt(match[1].replace(/,/g, '')) : undefined;
}

export class EomisaeScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const $ = await fetchHtml('https://eomisae.co.kr/fs');

    const posts: ScrapedPost[] = [];

    $('div.card_el').each((_, el) => {
      const a = $(el).find('h3 a.pjax').first();
      const href = a.attr('href') ?? '';
      if (!href) return;

      const title = a.text().trim();
      if (!title || title.length < 2) return;

      const url = href.startsWith('http')
        ? href
        : `https://eomisae.co.kr${href}`;

      const category = $(el).find('span.cate').text().replace(/,\s*$/, '').trim() || undefined;

      const infosHtml = $(el).find('div.infos').html() ?? '';
      const viewCount = extractCountAfterIcon(infosHtml, 'ion-ios-eye');
      const commentCount = extractCountAfterIcon(infosHtml, 'ion-ios-chatbubble');
      const likeCount = extractCountAfterIcon(infosHtml, 'ion-ios-heart');

      const thumbnail = $(el).find('img.tmb').attr('src') || undefined;
      const normalizedThumb = thumbnail?.startsWith('//')
        ? `https:${thumbnail}`
        : thumbnail;

      posts.push({
        sourceKey: 'eomisae',
        sourceName: '어미새',
        title,
        url,
        viewCount,
        commentCount,
        likeCount,
        thumbnail: normalizedThumb,
        contentSnippet: category ? `[${category}]` : undefined,
      });
    });

    return posts.slice(0, 30);
  }
}
