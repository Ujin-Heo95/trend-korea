/**
 * v8 Unified Scoring Pipeline — 공통 타입 계약.
 *
 * 설계 원칙:
 *  - 4개 채널(community/news/video/portal) 모두 동일 공식 적용
 *  - embedding 기반 k-NN 클러스터링이 유일한 유사도 판단
 *  - cross_channel_echo 가 post 레벨 랭킹에 타 채널 반향을 주입
 *
 * 기존 `post_scores` 를 재사용하지만 컬럼 의미가 달라짐:
 *   authority / freshness / engagement / topic_importance / cross_channel_echo
 *
 * 모든 신호는 [1.0, ∞) 의 배수. 최종 post_score 는 곱 후 log-normalize.
 */

export type V8Channel = 'community' | 'news' | 'video' | 'portal';

/** 스코어링 대상 포스트 최소 필드 */
export interface V8Post {
  readonly id: number;
  readonly title: string;
  readonly url: string;
  readonly sourceKey: string;
  readonly category: string | null;
  readonly channel: V8Channel;
  readonly scrapedAt: Date;
  readonly publishedAt: Date | null;
  readonly viewCount: number;
  readonly commentCount: number;
  readonly likeCount: number;
  readonly thumbnailUrl: string | null;
  /** category → channel 매핑 결과. null 이면 스코어링 제외 */
}

/** 5개 신호 분해 — 디버깅/품질 분석용 컬럼 */
export interface V8SignalBreakdown {
  readonly authority: number;           // [1.0, ~3.0]  소스 티어
  readonly freshness: number;           // (0, 1.0]     지수 감쇠
  readonly engagement: number;          // [1.0, ~3.0]  Z-score 기반
  readonly topicImportance: number;     // [1.0, ~2.5]  cluster 크기·다양성
  readonly crossChannelEcho: number;    // [1.0, ~2.0]  타 채널 k-NN 반향
}

export interface V8PostScore {
  readonly postId: number;
  readonly channel: V8Channel;
  readonly rawScore: number;            // signals 곱
  readonly normalizedScore: number;     // 채널 내 Z-score 기반, 채널 간 비교 가능
  readonly signals: V8SignalBreakdown;
  readonly calculatedAt: Date;
}

/** k-NN 클러스터 (= issue 후보) */
export interface V8Cluster {
  readonly id: string;                  // stable id (대표 postId 기반)
  readonly memberPostIds: readonly number[];
  readonly uniqueSources: number;
  readonly uniqueChannels: number;
  readonly channelBreakdown: Readonly<Record<V8Channel, number>>;
}

/** 랭킹된 이슈 카드 */
export interface V8IssueCard {
  readonly clusterId: string;
  readonly title: string;               // 대표 포스트 제목
  readonly thumbnail: string | null;
  readonly category: string;            // keyword heuristic
  readonly issueScore: number;
  readonly topPosts: readonly V8PostScore[];
  readonly cluster: V8Cluster;
}
