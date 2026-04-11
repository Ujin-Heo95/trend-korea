import type { EntertainmentSub } from '../components/EntertainmentSubTabs';

export interface CategoryContext {
  category: string | undefined;
  isEntertainmentTab: boolean;
  isTravelTab: boolean;
  isPortalTab: boolean;
  entertainmentSub: EntertainmentSub;
  travelSub: string;
  selectedSources: string[];
  sortMode: 'trending' | 'latest';
}

export interface CategoryEntry {
  match: (ctx: CategoryContext) => boolean;
  component: string;
}

/**
 * Registry mapping (category, subcategory) combinations to component keys.
 * Order matters: first match wins.
 */
export const categoryRegistry: CategoryEntry[] = [
  { match: (ctx) => ctx.isEntertainmentTab && ctx.entertainmentSub === 'movie', component: 'MovieRankingTable' },
  { match: (ctx) => ctx.isEntertainmentTab && ctx.entertainmentSub === 'music', component: 'MusicRankingTable' },
  { match: (ctx) => ctx.isEntertainmentTab && ctx.entertainmentSub === 'performance', component: 'PerformanceRankingTable' },
  { match: (ctx) => ctx.isEntertainmentTab && ctx.entertainmentSub === 'books', component: 'BookRankingTable' },
  { match: (ctx) => ctx.isEntertainmentTab && ctx.entertainmentSub === 'ott', component: 'OttRankingTable' },
  { match: (ctx) => ctx.isEntertainmentTab && ctx.entertainmentSub === 'all', component: 'EntertainmentAllView' },
  { match: (ctx) => ctx.isTravelTab, component: 'TravelDashboard' },
  { match: (ctx) => ctx.isPortalTab && ctx.selectedSources.length === 0, component: 'PortalRankingView' },
  { match: (ctx) => ctx.category === 'community' && ctx.selectedSources.length === 0 && ctx.sortMode === 'trending', component: 'CommunityRankingList' },
];

export function findCategoryComponent(ctx: CategoryContext): string | undefined {
  return categoryRegistry.find((e) => e.match(ctx))?.component;
}
