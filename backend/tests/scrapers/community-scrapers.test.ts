import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Mock axios for scrapers that use it directly (bobaedream, instiz, natepann, ruliweb, theqoo, todayhumor)
vi.mock('axios');

// Mock fetchHtml for scrapers that use it (clien, cook82, etoland, fmkorea, humoruniv, inven, mlbpark, slrclub, ygosu)
vi.mock('../../src/scrapers/http-utils.js', () => ({
  fetchHtml: vi.fn(),
}));

import { fetchHtml } from '../../src/scrapers/http-utils.js';

import { BobaedreamScraper } from '../../src/scrapers/bobaedream.js';
import { ClienScraper } from '../../src/scrapers/clien.js';
import { Cook82Scraper } from '../../src/scrapers/cook82.js';
import { EtolandScraper } from '../../src/scrapers/etoland.js';
import { FmkoreaScraper } from '../../src/scrapers/fmkorea.js';
import { HumorunivScraper } from '../../src/scrapers/humoruniv.js';
import { InstizScraper } from '../../src/scrapers/instiz.js';
import { InvenScraper } from '../../src/scrapers/inven.js';
import { MlbparkScraper } from '../../src/scrapers/mlbpark.js';
import { NatepannScraper } from '../../src/scrapers/natepann.js';
import { RuliwebScraper } from '../../src/scrapers/ruliweb.js';
import { SlrclubScraper } from '../../src/scrapers/slrclub.js';
import { TheqooScraper } from '../../src/scrapers/theqoo.js';
import { TodayhumorScraper } from '../../src/scrapers/todayhumor.js';
import { YgosuScraper } from '../../src/scrapers/ygosu.js';

const pool = {} as any;

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Bobaedream ──────────────────────────────────────────────
describe('BobaedreamScraper', () => {
  const html = `<html><body><table>
    <tr class="best">
      <td>
        <a class="bsubject" href="/view?code=freeb&No=123" title="보배 인기글 제목">보배 인기글 제목
          <span class="totreply">15</span>
        </a>
      </td>
      <td class="author">작성자A</td>
    </tr>
    <tr class="best">
      <td>
        <a class="bsubject" href="https://www.bobaedream.co.kr/view?code=freeb&No=456">두번째 글</a>
      </td>
      <td class="author">작성자B</td>
    </tr>
    <tr class="best">
      <td>
        <a class="bsubject" href="/view?code=other&No=789">다른 코드 글</a>
      </td>
      <td class="author">작성자C</td>
    </tr>
  </table></body></html>`;

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });

  it('parses best posts', async () => {
    const scraper = new BobaedreamScraper(pool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'bobaedream',
      sourceName: '보배드림',
      title: '보배 인기글 제목',
      url: 'https://www.bobaedream.co.kr/view?code=freeb&No=123',
      author: '작성자A',
      commentCount: 15,
    });
    expect(posts[1].url).toBe('https://www.bobaedream.co.kr/view?code=freeb&No=456');
  });

  it('filters out non-freeb links', async () => {
    const scraper = new BobaedreamScraper(pool);
    const posts = await scraper.fetch();
    expect(posts.every(p => p.url.includes('code=freeb'))).toBe(true);
  });
});

// ─── Clien ───────────────────────────────────────────────────
describe('ClienScraper', () => {
  const html = `<html><body>
    <div class="list_item">
      <a class="list_subject" href="/service/board/park/12345">
        <span class="subject_fixed">클리앙 인기글</span>
      </a>
      <span class="hit">1.2k</span>
    </div>
    <div class="list_item">
      <a class="list_subject" href="/service/board/park/67890?page=2">
        <span class="subject_fixed">두번째 글</span>
      </a>
      <span class="hit">500</span>
    </div>
    <div class="list_item">
      <a class="list_subject" href="/service/board/rule/99999">
        <span class="subject_fixed">규칙 글</span>
      </a>
      <span class="hit">10</span>
    </div>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts with view counts', async () => {
    const scraper = new ClienScraper(pool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'clien',
      sourceName: '클리앙',
      title: '클리앙 인기글',
      url: 'https://www.clien.net/service/board/park/12345',
      viewCount: 1200,
    });
    // query string stripped
    expect(posts[1].url).toBe('https://www.clien.net/service/board/park/67890');
    expect(posts[1].viewCount).toBe(500);
  });

  it('filters out rule/annonce links', async () => {
    const scraper = new ClienScraper(pool);
    const posts = await scraper.fetch();
    expect(posts.some(p => p.url.includes('/rule/'))).toBe(false);
  });
});

// ─── Cook82 ──────────────────────────────────────────────────
describe('Cook82Scraper', () => {
  const html = `<html><body>
    <a href="read.php?num=12345">82쿡 인기글 제목</a>
    <a href="../read.php?num=67890">두번째 글</a>
    <a href="read.php?num=99">AB</a>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts', async () => {
    const scraper = new Cook82Scraper(pool);
    const posts = await scraper.fetch();
    // "AB" has length < 3, filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'cook82',
      sourceName: '82쿡',
      title: '82쿡 인기글 제목',
      url: 'https://www.82cook.com/entiz/read.php?num=12345',
    });
    expect(posts[1].url).toBe('https://www.82cook.com/entiz/read.php?num=67890');
  });
});

// ─── Etoland ─────────────────────────────────────────────────
describe('EtolandScraper', () => {
  const html = `<html><body>
    <a href="board.php?bo_table=etohumor01&wr_id=123">에토랜드 인기글</a>
    <a href="../bbs/board.php?bo_table=etohumor01&wr_id=456">두번째 글</a>
    <a href="board.php?bo_table=etohumor01&wr_id=789">※공지사항</a>
    <a href="board.php?bo_table=etohumor01&wr_id=101">OK</a>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts and filters short/notice titles', async () => {
    const scraper = new EtolandScraper(pool);
    const posts = await scraper.fetch();
    // "※공지사항" starts with ※ => filtered, "OK" length < 3 => filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'etoland',
      sourceName: '에토랜드',
      title: '에토랜드 인기글',
      url: 'https://www.etoland.co.kr/bbs/board.php?bo_table=etohumor01&wr_id=123',
    });
    expect(posts[1].url).toBe('https://www.etoland.co.kr/bbs/board.php?bo_table=etohumor01&wr_id=456');
  });
});

// ─── FmKorea ─────────────────────────────────────────────────
describe('FmkoreaScraper', () => {
  const html = `<html><body>
    <li class="li"><h3 class="title"><a href="/index.php?document_srl=111">에펨 인기글 [42]</a></h3><span class="ed"><span class="vr">15</span></span></li>
    <li class="li"><h3 class="title"><a href="https://www.fmkorea.com/222">댓글 없는 글</a></h3></li>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts and extracts comment count from title', async () => {
    const scraper = new FmkoreaScraper(pool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'fmkorea',
      sourceName: '에펨코리아',
      title: '에펨 인기글',
      url: 'https://www.fmkorea.com/index.php?document_srl=111',
      commentCount: 42,
    });
    expect(posts[1]).toMatchObject({
      title: '댓글 없는 글',
      url: 'https://www.fmkorea.com/222',
      commentCount: undefined,
    });
  });
});

// ─── Humoruniv ───────────────────────────────────────────────
describe('HumorunivScraper', () => {
  const html = `<html><body>
    <a href="read.html?table=pds&number=12345">웃대 인기글</a>
    <a href="/board/humor/read.html?table=pds&number=67890">두번째 글</a>
    <a href="read.html?table=other&number=99999">다른 테이블</a>
    <a href="read.html?table=pds&number=11111">AB</a>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts, filters non-pds and short titles', async () => {
    const scraper = new HumorunivScraper(pool);
    const posts = await scraper.fetch();
    // "다른 테이블" doesn't include table=pds => filtered, "AB" length < 3 => filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'humoruniv',
      sourceName: '웃긴대학',
      title: '웃대 인기글',
      url: 'https://web.humoruniv.com/board/humor/read.html?table=pds&number=12345',
    });
    expect(posts[1].url).toBe('https://web.humoruniv.com/board/humor/read.html?table=pds&number=67890');
  });
});

// ─── Instiz ──────────────────────────────────────────────────
describe('InstizScraper', () => {
  const html = `<html><body>
    <a href="https://www.instiz.net/pt/12345">
      <span class="sbj">인스티즈 인기글</span>
      <span class="listno">조회 1,234</span>
      <span class="cmt3" title="댓글 56개">56</span>
    </a>
    <a href="https://www.instiz.net/pt/67890">
      <span class="sbj">두번째 글</span>
      <span class="listno">조회 500</span>
    </a>
    <a href="https://www.instiz.net/pt/99999">
      <span>sbj 없는 글</span>
    </a>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });

  it('parses posts with view and comment counts', async () => {
    const scraper = new InstizScraper(pool);
    const posts = await scraper.fetch();
    // 3rd link has no .sbj => filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'instiz',
      sourceName: '인스티즈',
      title: '인스티즈 인기글',
      url: 'https://www.instiz.net/pt/12345',
      viewCount: 1234,
      commentCount: 56,
    });
    expect(posts[1]).toMatchObject({
      title: '두번째 글',
      viewCount: 500,
    });
  });
});

// ─── Inven ───────────────────────────────────────────────────
describe('InvenScraper', () => {
  const html = `<html><body>
    <a class="subject-link" href="/board/it/2652/111">인벤  인기글  제목</a>
    <a class="subject-link" href="https://www.inven.co.kr/board/it/2652/222">두번째 글</a>
    <a class="subject-link" href="/board/it/2652/333">AB</a>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts and normalizes whitespace', async () => {
    const scraper = new InvenScraper(pool);
    const posts = await scraper.fetch();
    // "AB" length < 3 => filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'inven',
      sourceName: '인벤',
      title: '인벤 인기글 제목',
      url: 'https://www.inven.co.kr/board/it/2652/111',
    });
    expect(posts[1].url).toBe('https://www.inven.co.kr/board/it/2652/222');
  });
});

// ─── MLBPark ─────────────────────────────────────────────────
describe('MlbparkScraper', () => {
  const html = `<html><body>
    <table class="tbl_type01"><tbody>
      <tr>
        <td class="tit"><a href="https://mlbpark.donga.com/mp/b.php?m=view&b=bullpen&id=111" alt="MLB 인기글">MLB 인기글 제목</a></td>
        <td class="viewV">1,234</td>
        <td><span class="replycnt">[42]</span></td>
      </tr>
      <tr>
        <td class="tit"><a href="https://mlbpark.donga.com/mp/b.php?m=view&b=bullpen&id=222">두번째 글 제목</a></td>
        <td class="viewV">567</td>
        <td><span class="replycnt">[0]</span></td>
      </tr>
      <tr>
        <td class="tit"><a href="https://mlbpark.donga.com/mp/b.php?m=view&b=bullpen&id=333" alt="짧은">짧은</a></td>
        <td class="viewV">10</td>
        <td></td>
      </tr>
    </tbody></table>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts with view/comment counts', async () => {
    const scraper = new MlbparkScraper(pool);
    const posts = await scraper.fetch();
    // "짧은" length < 5 => filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'mlbpark',
      sourceName: 'MLB파크',
      title: 'MLB 인기글',
      url: 'https://mlbpark.donga.com/mp/b.php?m=view&b=bullpen&id=111',
      viewCount: 1234,
      commentCount: 42,
    });
    expect(posts[1]).toMatchObject({
      title: '두번째 글 제목',
      viewCount: 567,
    });
  });
});

// ─── NatePann ────────────────────────────────────────────────
describe('NatepannScraper', () => {
  const html = `<html><body><table><tbody>
    <tr>
      <td class="subject">
        <a href="/talk/12345" title="네이트판 인기글">네이트판 인기글 <span class="reple-num">(15)</span></a>
      </td>
      <td>기타</td>
      <td>1,000</td>
    </tr>
    <tr>
      <td class="subject">
        <a href="/talk/67890">두번째 글</a>
      </td>
      <td>기타</td>
      <td>500</td>
    </tr>
  </tbody></table></body></html>`;

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });

  it('parses posts with view/comment counts', async () => {
    const scraper = new NatepannScraper(pool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'natepann',
      sourceName: '네이트판',
      title: '네이트판 인기글',
      url: 'https://pann.nate.com/talk/12345',
      viewCount: 1000,
      commentCount: 15,
    });
    expect(posts[1]).toMatchObject({
      title: '두번째 글',
      url: 'https://pann.nate.com/talk/67890',
      viewCount: 500,
    });
  });
});

// ─── Ruliweb ─────────────────────────────────────────────────
describe('RuliwebScraper', () => {
  const html = `<html><body><table>
    <tr class="table_body blocktarget">
      <td class="subject">
        <a class="subject_link deco flex center" href="/best/board/12345">
          <strong class="text_over">루리웹 인기글</strong>
          <span class="num_reply flex_item_1"> (15)</span>
        </a>
      </td>
      <td class="writer">작성자R</td>
      <td class="recomd">42</td>
      <td class="hit">3200</td>
      <td class="time">14:30</td>
    </tr>
    <tr class="table_body blocktarget">
      <td class="subject">
        <a class="subject_link deco flex center" href="/best/board/67890">
          <span class="text_over">두번째 글</span>
          <span class="num_reply flex_item_1"> (8)</span>
        </a>
      </td>
      <td class="writer">작성자S</td>
      <td class="recomd">20</td>
      <td class="hit">1500</td>
      <td class="time">13:10</td>
    </tr>
    <tr class="table_body blocktarget">
      <td class="subject">
        <a class="subject_link deco flex center" href="/market/12345">
          <strong class="text_over">마켓 글</strong>
        </a>
      </td>
      <td class="writer">작성자T</td>
      <td class="recomd">5</td>
      <td class="hit">800</td>
      <td class="time">12:00</td>
    </tr>
  </table></body></html>`;

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });

  it('parses posts and filters market links', async () => {
    const scraper = new RuliwebScraper(pool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'ruliweb',
      sourceName: '루리웹',
      title: '루리웹 인기글',
      url: 'https://bbs.ruliweb.com/best/board/12345',
      author: '작성자R',
      viewCount: 3200,
      commentCount: 15,
    });
    expect(posts[1]).toMatchObject({
      title: '두번째 글',
      author: '작성자S',
      viewCount: 1500,
      commentCount: 8,
    });
  });
});

// ─── SLRClub ─────────────────────────────────────────────────
describe('SlrclubScraper', () => {
  const html = `<html><body>
    <a href="vx2.php?id=hot_article&no=111">SLR 인기글</a>
    <a href="/bbs/vx2.php?id=hot_article&no=222">두번째 글</a>
    <a href="vx2.php?id=hot_article&no=333">AB</a>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts and filters short titles', async () => {
    const scraper = new SlrclubScraper(pool);
    const posts = await scraper.fetch();
    // "AB" length < 3 => filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'slrclub',
      sourceName: 'SLR클럽',
      title: 'SLR 인기글',
      url: 'https://www.slrclub.com/bbs/vx2.php?id=hot_article&no=111',
    });
    expect(posts[1].url).toBe('https://www.slrclub.com/bbs/vx2.php?id=hot_article&no=222');
  });
});

// ─── Theqoo ──────────────────────────────────────────────────
describe('TheqooScraper', () => {
  const html = `<html><body>
    <table class="bd_lst"><tbody>
      <tr>
        <td class="title"><a href="/hot/111">더쿠 인기글</a></td>
        <td class="m_no">1,234</td>
        <td><span class="replyNum">56</span></td>
      </tr>
      <tr>
        <td class="title"><a href="https://theqoo.net/hot/222">두번째 글</a></td>
        <td class="m_no">500</td>
        <td><span class="replyNum"></span></td>
      </tr>
      <tr>
        <td class="title"><a href="">빈 링크</a></td>
        <td class="m_no">10</td>
        <td></td>
      </tr>
    </tbody></table>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });

  it('parses posts with view/comment counts', async () => {
    const scraper = new TheqooScraper(pool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'theqoo',
      sourceName: '더쿠',
      title: '더쿠 인기글',
      url: 'https://theqoo.net/hot/111',
      viewCount: 1234,
      commentCount: 56,
    });
    expect(posts[1]).toMatchObject({
      title: '두번째 글',
      url: 'https://theqoo.net/hot/222',
      viewCount: 500,
    });
  });
});

// ─── TodayHumor ──────────────────────────────────────────────
describe('TodayhumorScraper', () => {
  const html = `<html><body><table>
    <tr class="view">
      <td class="subject">
        <a href="/board/view.php?table=humorbest&no=111">오유 인기글</a>
        <span class="list_memo_count_span">15</span>
      </td>
      <td class="hits">1,234</td>
    </tr>
    <tr class="view">
      <td class="subject">
        <a href="https://www.todayhumor.co.kr/board/view.php?table=humorbest&no=222">두번째 글</a>
      </td>
      <td class="hits">500</td>
    </tr>
    <tr class="view">
      <td class="subject">
        <a href="/board/view.php?table=other&no=333">다른 테이블</a>
      </td>
      <td class="hits">10</td>
    </tr>
  </table></body></html>`;

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: html });
  });

  it('parses posts and filters non-humorbest', async () => {
    const scraper = new TodayhumorScraper(pool);
    const posts = await scraper.fetch();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'todayhumor',
      sourceName: '오늘의유머',
      title: '오유 인기글',
      url: 'https://www.todayhumor.co.kr/board/view.php?table=humorbest&no=111',
      viewCount: 1234,
      commentCount: 15,
    });
    expect(posts[1]).toMatchObject({
      title: '두번째 글',
      url: 'https://www.todayhumor.co.kr/board/view.php?table=humorbest&no=222',
      viewCount: 500,
    });
  });
});

// ─── Ygosu ───────────────────────────────────────────────────
describe('YgosuScraper', () => {
  const html = `<html><body>
    <a href="/community/board/best_article/111">와이고수 인기글 (23)</a>
    <a href="https://www.ygosu.com/community/board/best_article/222">댓글 없는 글 제목</a>
    <a href="/community/board/best_article/notice/333">공지사항 글</a>
    <a href="/community/board/best_article/444">짧음</a>
  </body></html>`;

  beforeEach(() => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(html));
  });

  it('parses posts, extracts comment from title suffix, filters notice/short', async () => {
    const scraper = new YgosuScraper(pool);
    const posts = await scraper.fetch();
    // notice => filtered, "짧음" length < 5 => filtered
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'ygosu',
      sourceName: '와이고수',
      title: '와이고수 인기글',
      url: 'https://www.ygosu.com/community/board/best_article/111',
      commentCount: 23,
    });
    expect(posts[1]).toMatchObject({
      title: '댓글 없는 글 제목',
      commentCount: undefined,
    });
  });
});

// ─── Cross-cutting: empty HTML returns empty array ───────────
describe('Empty HTML handling', () => {
  const emptyHtml = '<html><body></body></html>';

  it('all fetchHtml-based scrapers return [] on empty HTML', async () => {
    vi.mocked(fetchHtml).mockResolvedValue(cheerio.load(emptyHtml));

    const scrapers = [
      new ClienScraper(pool),
      new Cook82Scraper(pool),
      new EtolandScraper(pool),
      new FmkoreaScraper(pool),
      new HumorunivScraper(pool),
      new InvenScraper(pool),
      new MlbparkScraper(pool),
      new SlrclubScraper(pool),
      new YgosuScraper(pool),
    ];

    for (const scraper of scrapers) {
      const posts = await scraper.fetch();
      expect(posts).toEqual([]);
    }
  });

  it('all axios-based scrapers return [] on empty HTML', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: emptyHtml });

    const scrapers = [
      new BobaedreamScraper(pool),
      new InstizScraper(pool),
      new NatepannScraper(pool),
      new RuliwebScraper(pool),
      new TheqooScraper(pool),
      new TodayhumorScraper(pool),
    ];

    for (const scraper of scrapers) {
      const posts = await scraper.fetch();
      expect(posts).toEqual([]);
    }
  });
});
