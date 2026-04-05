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
  news: 'news', press: 'news', newsletter: 'news', government: 'news',
  video: 'video', video_popular: 'video',
  sns: 'sns',
  tech: 'specialized', techblog: 'specialized', finance: 'specialized',
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
  daum_news: 1.8, google_news_kr: 1.6, newsis: 1.8,
  // YouTube (정규 언론사 = T1, 일반 = 1.2)
  youtube: 2.5,
  // 테크
  geeknews: 1.3, yozm: 1.3, etnews: 1.5,
  naver_d2: 1.1, kakao_tech: 1.1, toss_tech: 1.1,
  // 커뮤니티
  dcinside: 1.0, bobaedream: 1.0, ruliweb: 1.0, theqoo: 1.0,
  instiz: 1.0, natepann: 1.0,
  // 기타
  ppomppu: 1.0,
  kopis_boxoffice: 1.2,
  sports_donga: 1.2,
  ruliweb_hot: 0.9, clien_jirum: 0.9,
  quasarzone_deal: 0.9, dcinside_hotdeal: 0.9,
};
const DEFAULT_SOURCE_WEIGHT = 0.8;

const CATEGORY_WEIGHTS: Record<string, number> = {
  alert: 1.25, news: 1.20, trend: 1.15, tech: 1.15,
  finance: 1.10, community: 1.08, video: 0.95,
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

// ─── Community-Specific Weights ───

const COMMUNITY_SOURCE_WEIGHTS: Record<string, number> = {
  // Tier A: 바이럴 허브 (자체 필터링된 인기글)
  theqoo: 1.4, instiz: 1.35, natepann: 1.3,
  // Tier B: 고볼륨·고참여
  clien: 1.2, dcinside: 1.15, fmkorea: 1.15, todayhumor: 1.1,
  // Tier C: 니치
  ppomppu: 1.0, bobaedream: 1.0, mlbpark: 1.0, cook82: 1.0, dogdrip: 1.0,
  // Tier D: 소규모/하락세
  inven: 0.9, ddanzi: 0.9, humoruniv: 0.85, ygosu: 0.85, slrclub: 0.8, etoland: 0.8,
};
const DEFAULT_COMMUNITY_SOURCE_WEIGHT = 1.0;

const COMMUNITY_DECAY_HALF_LIFE: Record<string, number> = {
  dcinside: 120, fmkorea: 120, dogdrip: 120,
  theqoo: 150, instiz: 150, natepann: 150, todayhumor: 150, cook82: 150,
  clien: 200, bobaedream: 200,
  ppomppu: 180, mlbpark: 180, inven: 180,
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
