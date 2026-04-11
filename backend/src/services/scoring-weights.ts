// ─── Scored Categories (single source of truth) ───
// 스코어링 + 이슈 집계 + 임베딩 대상 카테고리 — 변경 시 여기만 수정
export const SCORED_CATEGORIES = ['news', 'community', 'video', 'portal'] as const;
export type ScoredCategory = typeof SCORED_CATEGORIES[number];
/** SQL IN 절용 리터럴: ('news','community','video','portal') */
export const SCORED_CATEGORIES_SQL = `(${SCORED_CATEGORIES.map(c => `'${c}'`).join(',')})`;

// ─── Channel-specific Decay ───
// 커뮤니티/SNS는 실시간성 중시, 영상은 수명이 김

export type Channel = 'community' | 'news' | 'video' | 'sns' | 'specialized';

export const CHANNEL_HALF_LIFE_MINUTES: Record<Channel, number> = {
  community: 150,    // 2.5h → 24h후 0.06%
  sns: 120,          // 2h → 24h후 0.002%
  news: 240,         // 4h → 24h후 1.56%
  specialized: 300,  // 5h → 24h후 0.46%
  video: 360,        // 6h → 24h후 6.25% (기존 유지)
};
export const DEFAULT_HALF_LIFE_MINUTES = 300; // fallback

// ─── Channel Mapping ───

const CATEGORY_TO_CHANNEL: Record<string, Channel> = {
  community: 'community', blog: 'community',
  news: 'news', newsletter: 'news', government: 'news', portal: 'news',
  video: 'video',
  sns: 'sns',
  tech: 'specialized', techblog: 'specialized',
  deals: 'specialized', alert: 'specialized', trend: 'specialized',
  sports: 'specialized', movie: 'specialized', performance: 'specialized',
  travel: 'specialized', music: 'specialized', books: 'specialized', ott: 'specialized',
};

export function getChannel(category: string | null): Channel {
  return (category ? CATEGORY_TO_CHANNEL[category] : undefined) ?? 'specialized';
}

// ─── Source & Category Weights ───
// T1(2.5) 통신사·집계  T2(2.2) 방송사+조중  T3(2.0) 주요 언론
// T4(1.8) 포털·통합  T5(1.3~1.5) 테크  커뮤니티(1.0)  기본(0.8)

const SOURCE_WEIGHTS: Record<string, number> = {
  // T1: 통신사 + 뉴스 집계
  yna: 2.5, naver_news_ranking: 2.5, bigkinds_issues: 2.5,
  // T2: 방송사 + 조중
  sbs: 2.2, kbs: 2.2, mbc: 2.2, jtbc: 2.2, chosun: 2.2, joins: 2.2,
  // T3: 주요 언론
  khan: 2.0, mk: 2.0, hani: 2.0, donga: 2.0, hankyung: 2.0, ytn: 2.0,
  // T4: 포털·통합
  daum_news: 1.8, google_news_kr: 1.6, newsis: 1.8, ddanzi: 1.6, etnews: 2.0,
  nate_news: 1.8, zum_news: 1.6,
  // YouTube (정규 언론사 = T1, 일반 = 1.2)
  youtube: 2.5,
  // 테크
  geeknews: 1.3, yozm: 1.3,
  naver_d2: 1.1, kakao_tech: 1.1, toss_tech: 1.1,
  // 커뮤니티
  dcinside: 1.0, bobaedream: 1.0, ruliweb: 1.0, theqoo: 1.0,
  instiz: 1.0, natepann: 1.0,
  // 핫딜
  ppomppu_best: 0.9, ppomppu_hot: 0.9,
  kopis_boxoffice: 1.2,
  sports_donga: 1.2,
  ruliweb_hot: 0.9, clien_jirum: 0.9,
  quasarzone_deal: 0.9, dcinside_hotdeal: 0.9,
};
const DEFAULT_SOURCE_WEIGHT = 0.8;

const CATEGORY_WEIGHTS: Record<string, number> = {
  alert: 1.25, news: 1.20, portal: 1.20, trend: 1.15, tech: 1.15,
  community: 1.08, video: 0.95,
  movie: 1.05, performance: 1.05, travel: 1.05, music: 1.05, books: 1.05, ott: 1.05,
  deals: 1.00, government: 0.85, newsletter: 0.80,
};
const DEFAULT_CATEGORY_WEIGHT = 1.00;

export function getSourceWeight(sourceKey: string): number {
  return SOURCE_WEIGHTS[sourceKey] ?? DEFAULT_SOURCE_WEIGHT;
}

export function getCategoryWeight(category: string | null): number {
  return category ? (CATEGORY_WEIGHTS[category] ?? DEFAULT_CATEGORY_WEIGHT) : DEFAULT_CATEGORY_WEIGHT;
}

// ─── News-Specific Decay ───
// 소스별 차등 반감기: 통신사(빠름) → 방송(표준) → 일간지(느림) → 경제지(더 느림)

const NEWS_DECAY_HALF_LIFE: Record<string, number> = {
  // 속보형 통신사 (빠른 순환)
  yna: 180, newsis: 180, naver_news_ranking: 180, ytn: 200,
  // 방송사 (표준)
  sbs: 240, kbs: 240, mbc: 240, jtbc: 240,
  // 종합일간지 (느린 순환)
  chosun: 300, joins: 300, donga: 300, khan: 300, hani: 300,
  // 경제지 (더 긴 수명)
  mk: 320, hankyung: 320, etnews: 320,
  // 포털 집계 (빠른 갱신)
  daum_news: 200, nate_news: 200, zum_news: 200, google_news_kr: 200,
};
const DEFAULT_NEWS_DECAY = 240;

export function getNewsHalfLife(sourceKey: string): number {
  return NEWS_DECAY_HALF_LIFE[sourceKey] ?? DEFAULT_NEWS_DECAY;
}

// ─── Community-Specific Weights ───

const COMMUNITY_SOURCE_WEIGHTS: Record<string, number> = {
  // Tier A: 바이럴 허브 (자체 필터링된 인기글)
  theqoo: 1.4, instiz: 1.35, natepann: 1.3,
  // Tier B: 고볼륨·고참여
  clien: 1.2, dcinside: 1.15, todayhumor: 1.1,
  // Tier C: 니치
  bobaedream: 1.0, mlbpark: 1.0, cook82: 1.0, dogdrip: 1.0,
  // Tier D: 소규모/하락세
  inven: 0.9, humoruniv: 0.85, ygosu: 0.85, slrclub: 0.8, etoland: 0.8,
};
const DEFAULT_COMMUNITY_SOURCE_WEIGHT = 1.0;

const COMMUNITY_DECAY_HALF_LIFE: Record<string, number> = {
  dcinside: 120, dogdrip: 120,
  theqoo: 150, instiz: 150, natepann: 150, todayhumor: 150, cook82: 150,
  clien: 200, bobaedream: 200,
  mlbpark: 180, inven: 180,
};
const DEFAULT_COMMUNITY_DECAY = 150;

export function getCommunitySourceWeight(sourceKey: string): number {
  return COMMUNITY_SOURCE_WEIGHTS[sourceKey] ?? DEFAULT_COMMUNITY_SOURCE_WEIGHT;
}

export function getCommunityHalfLife(sourceKey: string): number {
  return COMMUNITY_DECAY_HALF_LIFE[sourceKey] ?? DEFAULT_COMMUNITY_DECAY;
}

export function getHalfLife(channel: Channel): number {
  return CHANNEL_HALF_LIFE_MINUTES[channel] ?? DEFAULT_HALF_LIFE_MINUTES;
}

/** 소스별 게시물 볼륨 과대표현 억제 (중앙값 대비 로그 감쇄, 하한 0.7) */
export function volumeDampeningFactor(sourceCount: number, medianCount: number): number {
  if (sourceCount <= medianCount || medianCount <= 0) return 1.0;
  return Math.max(0.7, 1.0 - 0.15 * Math.log(sourceCount / medianCount));
}

// ─── DB Config Pre-fetched Weights ───
// 배치 사이클 시작 시 한 번 로드하여 동기 함수에 전달하는 패턴

import { getScoringConfig } from './scoringConfig.js';

export interface PreloadedWeights {
  readonly sourceWeights: Record<string, number>;
  readonly defaultSourceWeight: number;
  readonly categoryWeights: Record<string, number>;
  readonly defaultCategoryWeight: number;
  readonly communitySourceWeights: Record<string, number>;
  readonly defaultCommunitySourceWeight: number;
  readonly communityDecayHalfLives: Record<string, number>;
  readonly defaultCommunityDecay: number;
  readonly channelHalfLives: Record<string, number>;
  readonly defaultHalfLife: number;
  readonly newsDecayHalfLives: Record<string, number>;
  readonly defaultNewsDecay: number;
}

/** 배치 시작 시 DB에서 설정을 한 번만 로드 (Pre-fetch 패턴) */
export async function preloadWeights(): Promise<PreloadedWeights> {
  const config = getScoringConfig();

  const [srcRec, catRec, commSrcRec, commDecayRec, chHalfRec, newsDecayRec] = await Promise.all([
    config.getRecord('source_weights', 'values'),
    config.getRecord('category_weights', 'values'),
    config.getRecord('community_source_weights', 'values'),
    config.getRecord('community_decay_half_lives', 'values'),
    config.getRecord('channel_half_lives', 'values'),
    config.getRecord('news_decay_half_lives', 'values'),
  ]);

  return {
    sourceWeights: srcRec,
    defaultSourceWeight: srcRec['DEFAULT'] ?? DEFAULT_SOURCE_WEIGHT,
    categoryWeights: catRec,
    defaultCategoryWeight: catRec['DEFAULT'] ?? DEFAULT_CATEGORY_WEIGHT,
    communitySourceWeights: commSrcRec,
    defaultCommunitySourceWeight: commSrcRec['DEFAULT'] ?? DEFAULT_COMMUNITY_SOURCE_WEIGHT,
    communityDecayHalfLives: commDecayRec,
    defaultCommunityDecay: commDecayRec['DEFAULT'] ?? DEFAULT_COMMUNITY_DECAY,
    channelHalfLives: chHalfRec,
    defaultHalfLife: chHalfRec['DEFAULT'] ?? DEFAULT_HALF_LIFE_MINUTES,
    newsDecayHalfLives: newsDecayRec,
    defaultNewsDecay: newsDecayRec['DEFAULT'] ?? DEFAULT_NEWS_DECAY,
  };
}

/** Pre-loaded 가중치에서 소스 가중치 조회 */
export function getSourceWeightFrom(w: PreloadedWeights, sourceKey: string): number {
  return w.sourceWeights[sourceKey] ?? w.defaultSourceWeight;
}

/** Pre-loaded 가중치에서 카테고리 가중치 조회 */
export function getCategoryWeightFrom(w: PreloadedWeights, category: string | null): number {
  return category ? (w.categoryWeights[category] ?? w.defaultCategoryWeight) : w.defaultCategoryWeight;
}

/** Pre-loaded 가중치에서 커뮤니티 소스 가중치 조회 */
export function getCommunitySourceWeightFrom(w: PreloadedWeights, sourceKey: string): number {
  return w.communitySourceWeights[sourceKey] ?? w.defaultCommunitySourceWeight;
}

/** Pre-loaded 가중치에서 커뮤니티 반감기 조회 */
export function getCommunityHalfLifeFrom(w: PreloadedWeights, sourceKey: string): number {
  return w.communityDecayHalfLives[sourceKey] ?? w.defaultCommunityDecay;
}

/** Pre-loaded 가중치에서 채널 반감기 조회 */
export function getHalfLifeFrom(w: PreloadedWeights, channel: Channel): number {
  return w.channelHalfLives[channel] ?? w.defaultHalfLife;
}

/** Pre-loaded 가중치에서 뉴스 소스별 반감기 조회 */
export function getNewsHalfLifeFrom(w: PreloadedWeights, sourceKey: string): number {
  return w.newsDecayHalfLives[sourceKey] ?? w.defaultNewsDecay;
}
