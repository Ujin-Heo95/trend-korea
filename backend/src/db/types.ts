/** Database row types for pg query results */

export interface PostRow {
  id: number;
  source_key: string;
  source_name: string;
  title: string;
  url: string;
  thumbnail: string | null;
  author: string | null;
  view_count: number;
  comment_count: number;
  like_count: number;
  vote_count: number;
  published_at: string | null;
  first_scraped_at: string;
  scraped_at: string;
  category: string | null;
  subcategory: string | null;
  content_snippet: string | null;
  metadata: Record<string, unknown> | null;
  event_date: string | null;
}

export interface PostRowWithScore extends PostRow {
  trend_score: number;
}

export interface PostRowWithCluster extends PostRow {
  cluster_size?: number;
  cluster_id?: number | null;
  related_sources?: { id: number; source_name: string; source_key: string; url: string }[];
}

export interface PostStatsRow {
  source_key: string;
  post_count: number;
  last_updated: string | null;
}

export interface RunStatsRow {
  source_key: string;
  total_runs_24h: number;
  success_runs_24h: number;
  avg_posts_per_run: number | null;
}

/** KMA weather API response shape */
export interface KmaApiResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: unknown[] } };
  };
}

/** YouTube Data API item shapes */
export interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    thumbnails?: { medium?: { url?: string } };
    channelTitle: string;
    publishedAt?: string;
    categoryId?: string;
    tags?: string[];
    description?: string;
  };
  statistics?: {
    viewCount?: string;
    commentCount?: string;
    likeCount?: string;
  };
  contentDetails?: {
    duration?: string;
    definition?: string;
  };
}

export interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    thumbnails?: { medium?: { url?: string } };
    channelTitle: string;
    publishedAt?: string;
    description?: string;
  };
}

/** Daum search API document shape */
export interface DaumSearchDoc {
  title: string;
  url: string;
  thumbnail?: string;
  cafename?: string;
  blogname?: string;
  datetime?: string;
  contents?: string;
}

export interface IssueRankingRow {
  id: number;
  title: string;
  summary: string | null;
  category_label: string | null;
  issue_score: number;
  news_score: number;
  community_score: number;
  trend_signal_score: number;
  video_score: number;
  momentum_score: number;
  news_post_count: number;
  community_post_count: number;
  video_post_count: number;
  representative_thumbnail: string | null;
  cluster_ids: number[];
  standalone_post_ids: number[];
  matched_trend_keywords: string[];
  cross_validation_score: number;
  cross_validation_sources: string[];
  rank_change: number | null;
  stable_id: string | null;
  quality_score: number | null;
  ai_keywords: string[];
  sentiment: string | null;
  calculated_at: string;
  expires_at: string;
}

export interface TrendKeywordRow {
  id: number;
  keyword: string;
  keyword_normalized: string;
  source_key: string;
  signal_strength: number;
  metadata: Record<string, unknown> | null;
  scraped_at: Date;
  expires_at: Date;
}
