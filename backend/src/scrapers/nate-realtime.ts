import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://news.nate.com/',
};

// Nate 뉴스 랭킹 (관심뉴스 일간)
// https://news.nate.com/rank/interest?sc=all&p=day
// EUC-KR 인코딩, cheerio 파싱
// 메인 5건(mduSubjectList, 썸네일 포함) + 사이드바 24건(뉴스/스포츠/연예 각 8건)

function normalizeNateUrl(href: string): string {
  if (href.startsWith('http')) return href;
  // //news.nate.com/... 또는 //sports.news.nate.com/... 형태
  if (href.startsWith('//')) return `https:${href}`;
  return `https://news.nate.com${href}`;
}

export class NateNewsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const { data } = await axios.get<ArrayBuffer>(
      'https://news.nate.com/rank/interest?sc=all&p=day',
      {
        headers: HEADERS,
        timeout: 15_000,
        responseType: 'arraybuffer',
      },
    );

    const html = new TextDecoder('euc-kr').decode(data);
    const $ = cheerio.load(html);
    const posts: ScrapedPost[] = [];
    const seenUrls = new Set<string>();

    // 1) 메인 랭킹: mduSubjectList 블록 (상위 5건, 썸네일 포함)
    $('div.mduSubjectList').each((_, block) => {
      if (posts.length >= 30) return;

      const rankText = $(block).find('dl.mduRank dt em').first().text().trim();
      const rank = parseInt(rankText, 10) || posts.length + 1;

      const a = $(block).find('a[href*="/view/"]').first();
      const href = a.attr('href') ?? '';
      const title = a.find('h2.tit').text().trim();
      if (!title || !href) return;

      const url = normalizeNateUrl(href);
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      const thumbnail = a.find('img').first().attr('src') || undefined;
      const mediumText = $(block).find('span.medium').text().trim();
      const author = mediumText.replace(/\d{4}-\d{2}-\d{2}.*/, '').trim() || undefined;

      posts.push({
        sourceKey: 'nate_news',
        sourceName: '네이트 뉴스 랭킹',
        title,
        url,
        thumbnail,
        author,
        category: 'portal',
        metadata: { rank },
      });
    });

    // 2) 사이드바 랭킹: sidebar.rankingNews 내 side_list (뉴스/스포츠/연예 각 8건)
    $('div.sidebar.rankingNews ul.side_list li').each((_, li) => {
      if (posts.length >= 30) return;

      const a = $(li).find('a').first();
      const href = a.attr('href') ?? '';
      // 사이드바 구조에 따라 텍스트에 썸네일 alt/카운트가 섞일 수 있어 제목은 명시적으로 추출
      const title = (a.find('strong, .tit, .txt').first().text().trim() || a.text().trim())
        .replace(/\s+/g, ' ');
      if (!title || title.length < 4 || !href) return;

      const url = normalizeNateUrl(href);
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      // 썸네일: li 내부의 img (일부 항목에만 존재)
      const imgRaw = $(li).find('img').first().attr('src') || $(li).find('img').first().attr('data-src');
      const thumbnail = imgRaw ? (imgRaw.startsWith('//') ? `https:${imgRaw}` : imgRaw) : undefined;

      posts.push({
        sourceKey: 'nate_news',
        sourceName: '네이트 뉴스 랭킹',
        title,
        url,
        thumbnail,
        category: 'portal',
        metadata: { rank: posts.length + 1 },
      });
    });

    return posts;
  }
}
