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
}
