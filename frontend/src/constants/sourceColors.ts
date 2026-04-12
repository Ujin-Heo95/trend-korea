/** Category-based default colors — new sources auto-inherit from their category */
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
  deal: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  music: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
};

/** Source-specific overrides for visual differentiation */
const SOURCE_OVERRIDES: Record<string, string> = {
  // Community — unique brand colors
  dcinside: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  theqoo: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
  instiz: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  natepann: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  todayhumor: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-400',
  ppomppu: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  ruliweb: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  clien: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
  fmkorea: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  bobaedream: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  mlbpark: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  inven: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
  humoruniv: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  // News — differentiate major outlets
  hani: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  khan: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400',
  hankyung: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  mk: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  // Trend
  google_trends: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  naver_datalab: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  // Video — broadcaster brand colors
  youtube_sbs_news: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  youtube_ytn: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  youtube_mbc_news: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
  youtube_kbs_news: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  youtube_jtbc_news: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  // Portal — distinct hues per provider
  bigkinds_issues: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  naver_news_ranking: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  zum_news: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  google_news_kr: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400',
  nate_news: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  // Deal — distinct hues per community
  clien_jirum: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400',
  quasarzone_deal: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
  eomisae: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-400',
  ruliweb_hot: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  ppomppu_hot: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
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
  quasarzone_deal: '뭬이사존',
  eomisae: '어미새',
  ruliweb_hot: '루리웹',
  ppomppu_hot: '뽐뿌',
};

export function getSourceLabel(sourceKey: string, fallback: string): string {
  return SOURCE_LABEL_OVERRIDES[sourceKey] ?? fallback;
}

const FALLBACK = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';

/**
 * Get the color classes for a source badge.
 * Priority: source override > category default > fallback.
 */
export function getSourceColor(sourceKey: string, category?: string | null): string {
  return SOURCE_OVERRIDES[sourceKey]
    ?? (category ? CATEGORY_COLORS[category] : undefined)
    ?? FALLBACK;
}

/** @deprecated Use getSourceColor() instead — kept for backwards compat during migration */
export const SOURCE_COLORS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    return SOURCE_OVERRIDES[prop] ?? FALLBACK;
  },
});
