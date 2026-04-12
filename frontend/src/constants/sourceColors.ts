import type { CSSProperties } from 'react';

/** Category-based default colors — fallback when no brand hex is registered */
const CATEGORY_COLORS: Record<string, string> = {
  community: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  news: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  video: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  tech: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
  portal: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  sns: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
  alert: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  trend: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  movie: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-400',
  performance: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  deals: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  music: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
  books: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  ott: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  webtoon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
};

/**
 * Brand hex colors per source — text color uses this hex directly,
 * background uses color-mix() to create a faint tint that works in both themes.
 * Yellows / very light brand colors are pre-darkened for AA contrast.
 */
const SOURCE_BRAND_HEX: Record<string, string> = {
  // ── Community ──
  dcinside: '#1B1BCC',
  theqoo: '#D14785',
  instiz: '#6B3FA0',
  natepann: '#B58900',
  todayhumor: '#5C7A29',
  ppomppu: '#C8102E',
  ruliweb: '#D45500',
  clien: '#0085C2',
  bobaedream: '#009A4E',
  mlbpark: '#1A3A8A',
  inven: '#5E2E91',
  humoruniv: '#B58900',
  arcalive: '#3A6FB0',
  cook82: '#C2185B',
  ygosu: '#1F6FEB',
  slrclub: '#1F6FEB',
  etoland: '#0F766E',
  dogdrip: '#7B341E',

  // ── News ──
  yna: '#1F4E78',
  hani: '#1F4E78',
  sbs: '#14479B',
  donga: '#0066B3',
  khan: '#C8102E',
  hankyung: '#C8102E',
  mk: '#003DA5',
  seoul: '#003DA5',
  kmib: '#C8102E',
  yozm: '#1F6FEB',
  korea_kr_press: '#1F4E78',
  korea_kr_policy: '#1F4E78',
  korea_press: '#1F4E78',
  korea_policy: '#1F4E78',
  korea_briefing: '#1F4E78',
  sedaily: '#003DA5',
  newsis: '#003DA5',
  ddanzi: '#C8102E',
  chosun: '#C8102E',
  joins: '#003DA5',
  kbs: '#1A4E96',
  mbc: '#E60012',
  jtbc: '#8B6914',
  ytn: '#C8102E',
  daum_news: '#B58900',
  etnews: '#0066B3',
  ohmynews: '#2E7D32',
  moneytoday: '#C8102E',
  nocutnews: '#C8102E',
  asiae: '#003DA5',
  segye: '#003DA5',
  edaily: '#003DA5',
  bizwatch: '#0066B3',
  bbc_korean: '#BB1919',
  mbn: '#C8102E',

  // ── Tech ──
  zdnet_kr: '#444444',
  itworld_kr: '#003DA5',

  // ── Video (broadcaster YouTube) ──
  youtube: '#FF0000',
  youtube_sbs_news: '#14479B',
  youtube_ytn: '#C8102E',
  youtube_mbc_news: '#E60012',
  youtube_kbs_news: '#1A4E96',
  youtube_jtbc_news: '#8B6914',
  youtube_search: '#FF0000',

  // ── Portal ──
  bigkinds_issues: '#1F4E96',
  naver_news_ranking: '#03C75A',
  zum_news: '#4C5BD4',
  google_news_kr: '#4285F4',
  nate_news: '#DC143C',

  // ── Deals ──
  ppomppu_best: '#C8102E',
  ppomppu_hot: '#C8102E',
  ruliweb_hot: '#D45500',
  clien_jirum: '#0085C2',
  quasarzone_deal: '#0091BD',
  eomisae: '#8B5A2B',

  // ── Trend ──
  google_trends: '#4285F4',
  wikipedia_ko: '#555555',

  // ── Books ──
  yes24_bestseller: '#1B5E20',
  aladin_bestseller: '#0085C2',

  // ── Music ──
  melon_chart: '#00A030',
  bugs_chart: '#D62828',
  genie_chart: '#F37321',
  kworb_spotify_kr: '#1DB954',
  kworb_youtube_kr: '#FF0000',

  // ── Webtoon ──
  naver_webtoon: '#00A045',

  // ── OTT ──
  flixpatrol: '#E50914',

  // ── Performance / Movie ──
  kopis_boxoffice: '#7C3AED',
  kobis_boxoffice: '#C2410C',

  // ── Alert ──
  airkorea: '#B58900',
};

/** Display label overrides — strip noisy suffixes / shorten portal names. */
const SOURCE_LABEL_OVERRIDES: Record<string, string> = {
  youtube_sbs_news: 'SBS 뉴스',
  youtube_ytn: 'YTN',
  youtube_mbc_news: 'MBC 뉴스',
  youtube_kbs_news: 'KBS 뉴스',
  youtube_jtbc_news: 'JTBC 뉴스',
  bigkinds_issues: '빅카인즈',
  naver_news_ranking: '네이버',
  zum_news: 'ZUM',
  google_news_kr: 'Google',
  nate_news: '네이트',
  clien_jirum: '클리앙',
  quasarzone_deal: '퀘이사존',
  eomisae: '어미새',
  ruliweb_hot: '루리웹',
  ppomppu_hot: '뽐뿌',
};

export function getSourceLabel(sourceKey: string, fallback: string): string {
  return SOURCE_LABEL_OVERRIDES[sourceKey] ?? fallback;
}

const FALLBACK_CLASS = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';

/**
 * Returns the Tailwind class fallback for a source — used when no brand hex
 * is registered (or as base classes alongside the inline style).
 */
export function getSourceColor(sourceKey: string, category?: string | null): string {
  if (SOURCE_BRAND_HEX[sourceKey]) return '';
  return (category ? CATEGORY_COLORS[category] : undefined) ?? FALLBACK_CLASS;
}

/**
 * Returns inline style for the source badge using its registered brand hex.
 * Background uses color-mix() to create a faint tint that adapts to the page bg
 * in both light and dark themes (≈14% in light, ≈22% in dark via fallback).
 */
export function getSourceBrandStyle(sourceKey: string): CSSProperties | undefined {
  const hex = SOURCE_BRAND_HEX[sourceKey];
  if (!hex) return undefined;
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 26%, transparent)`,
    color: hex,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hex} 35%, transparent)`,
  };
}

/** @deprecated kept for backwards compat */
export const SOURCE_COLORS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get() {
    return FALLBACK_CLASS;
  },
});
