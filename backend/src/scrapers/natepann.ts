import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';
import { parseKoreanDate } from './http-utils.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' };
const SOURCE_KEY = 'natepann';
const SOURCE_NAME = '네이트판';

export class NatepannScraper extends BaseScraper {
  constructor(pool: Pool) { super(pool); }

  async fetch(): Promise<ScrapedPost[]> {
    const [talkPosts, rankingPosts] = await Promise.all([
      this.fetchTalk(),
      this.fetchRanking(),
    ]);

    // 랭킹 글 우선 (viewCount/likeCount 보유), 일반글로 보충 — URL 기준 중복 제거
    const seen = new Set<string>();
    const merged: ScrapedPost[] = [];
    for (const post of [...rankingPosts, ...talkPosts]) {
      if (!seen.has(post.url)) {
        seen.add(post.url);
        merged.push(post);
      }
    }
    return merged.slice(0, 30);
  }

  /** 톡/커뮤니티 최신글 (c20001) */
  private async fetchTalk(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://pann.nate.com/talk/c20001', {
      headers: UA,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];

    $('tbody tr').each((_, el) => {
      const subjectTd = $(el).find('td.subject');
      const a = subjectTd.find('a[href^="/talk/"]').filter((__, link) => {
        const href = $(link).attr('href') ?? '';
        return /^\/talk\/\d+/.test(href);
      }).first();
      const href = (a.attr('href') ?? '').replace(/#.*$/, '').replace(/\?page=\d+/, '');
      if (!href) return;
      const title = (a.attr('title') ?? a.text()).trim();
      const url = `https://pann.nate.com${href}`;

      const tds = $(el).find('td');
      const commentMatch = subjectTd.find('.reple-num').text().match(/\((\d+)\)/);
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : undefined;
      const author = tds.eq(1).text().trim() || undefined;

      const dateText = tds.eq(2).text().trim() || tds.eq(3).text().trim();
      const publishedAt = parseKoreanDate(dateText);
      if (title && href) {
        posts.push({ sourceKey: SOURCE_KEY, sourceName: SOURCE_NAME, title, url, author, commentCount, publishedAt });
      }
    });

    return posts;
  }

  /** 명예의 전당 — 일간 인기 랭킹 (viewCount/likeCount 포함) */
  private async fetchRanking(): Promise<ScrapedPost[]> {
    const { data } = await axios.get('https://pann.nate.com/talk/ranking', {
      headers: UA,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const posts: ScrapedPost[] = [];
    const seen = new Set<string>();

    $('li').each((_, el) => {
      const a = $(el).find('a[href^="/talk/"]').filter((__, link) => {
        const h = $(link).attr('href') ?? '';
        return /^\/talk\/\d+/.test(h);
      }).first();
      const href = (a.attr('href') ?? '').replace(/#.*$/, '').replace(/\?.*$/, '');
      if (!href || seen.has(href)) return;
      seen.add(href);

      const title = (a.attr('title') ?? a.text()).trim();
      if (!title || title.length < 3) return;

      const url = `https://pann.nate.com${href}`;

      const countText = $(el).find('span.count').text();
      const viewMatch = countText.match(/([\d,]+)/);
      const viewCount = viewMatch ? parseInt(viewMatch[1].replace(/,/g, '')) : undefined;

      const rcmText = $(el).find('span.rcm').text();
      const rcmMatch = rcmText.match(/([\d,]+)/);
      const likeCount = rcmMatch ? parseInt(rcmMatch[1].replace(/,/g, '')) : undefined;

      const repleText = $(el).find('.reple-num').text();
      const repleMatch = repleText.match(/(\d+)/);
      const commentCount = repleMatch ? parseInt(repleMatch[1]) : undefined;

      posts.push({ sourceKey: SOURCE_KEY, sourceName: SOURCE_NAME, title, url, viewCount, commentCount, likeCount });
    });

    return posts;
  }
}
