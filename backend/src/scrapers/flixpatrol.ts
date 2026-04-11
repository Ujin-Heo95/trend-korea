import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
};

interface FlixItem {
  rank: number;
  title: string;
  slug: string;
  platform: string;
  type: string;
  changeLabel: string;
}

function parseFlixPage($: cheerio.CheerioAPI, platform: string): FlixItem[] {
  const items: FlixItem[] = [];

  $('table.card-table').each((_tableIdx, table) => {
    // Determine content type from the section header (h3 is a sibling before each table)
    const sectionHeader = $(table).prev('h3').text().trim()
      || $(table).prevAll('h3').first().text().trim()
      || $(table).closest('div').prevAll('h3').first().text().trim();

    let type = 'unknown';
    const headerLower = sectionHeader.toLowerCase();
    if (headerLower.includes('movie')) type = 'movie';
    else if (headerLower.includes('tv')) type = 'series';
    else if (headerLower.includes('overall')) type = 'mixed';
    else if (headerLower.includes('kid')) type = 'kids';

    $(table).find('tr.table-group').each((_rowIdx, row) => {
      const cells = $(row).find('td');
      const rankText = cells.eq(0).text().trim().replace('.', '');
      const rank = parseInt(rankText, 10);
      if (!rank || rank > 10) return;

      const changeBadge = cells.eq(1).find('div');
      const changeText = changeBadge.text().trim();
      const changeClass = changeBadge.attr('class') ?? '';
      let changeLabel = '—';
      if (changeClass.includes('bg-success')) changeLabel = `▲${changeText.replace('+', '')}`;
      else if (changeClass.includes('bg-danger')) changeLabel = `▼${changeText.replace('-', '')}`;
      else if (changeClass.includes('bg-blue')) changeLabel = 'NEW';

      const titleLink = cells.eq(2).find('a').first();
      const title = titleLink.text().trim();
      const slug = titleLink.attr('href')?.replace(/^\/title\//, '').replace(/\/$/, '') ?? '';

      if (!title) return;

      items.push({ rank, title, slug, platform, type, changeLabel });
    });
  });

  return items;
}

export class FlixPatrolScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    const [netflixRes, disneyRes] = await Promise.all([
      axios.get('https://flixpatrol.com/top10/netflix/south-korea/', {
        headers: HEADERS,
        timeout: 15_000,
      }),
      axios.get('https://flixpatrol.com/top10/disney/south-korea/', {
        headers: HEADERS,
        timeout: 15_000,
      }),
    ]);

    const netflixItems = parseFlixPage(cheerio.load(netflixRes.data), 'Netflix');
    const disneyItems = parseFlixPage(cheerio.load(disneyRes.data), 'Disney+');

    // Merge: Netflix first then Disney+, sorted by rank within each platform
    const allItems = [...netflixItems, ...disneyItems];

    return allItems.map(item => ({
      sourceKey: 'flixpatrol',
      sourceName: 'FlixPatrol',
      title: `${item.platform} ${item.rank}위 ${item.title} (${item.changeLabel})`,
      url: `https://flixpatrol.com/title/${item.slug}/`,
      category: 'ott',
      metadata: {
        rank: item.rank,
        title: item.title,
        platform: item.platform,
        type: item.type,
        changeLabel: item.changeLabel,
      },
    }));
  }
}
