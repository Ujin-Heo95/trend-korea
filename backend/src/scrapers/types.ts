export interface ScrapedPost {
  sourceKey: string;
  sourceName: string;
  title: string;
  url: string;
  thumbnail?: string;
  author?: string;
  viewCount?: number;
  commentCount?: number;
  likeCount?: number;
  publishedAt?: Date;
  category?: string;
  subcategory?: string;
  contentSnippet?: string;
  metadata?: Record<string, unknown>;
  /** 전시/공연 등 이벤트 시작일 (published_at과 구분) */
  eventDate?: Date;
}

/** trend_keywords 직접 기록용 입력 타입 */
export interface TrendKeywordInput {
  readonly keyword: string;
  readonly sourceKey: string;
  readonly signalStrength: number;
  readonly rankPosition?: number;
  readonly rankDirection?: '+' | '-' | 'n' | '=';
  readonly rankChange?: number;
  readonly metadata?: Record<string, unknown>;
}
