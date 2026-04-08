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
  travel: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-400',
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
};

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
