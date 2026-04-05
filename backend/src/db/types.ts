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
  scraped_at: string;
  category: string | null;
  subcategory: string | null;
  metadata: Record<string, unknown> | null;
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
  };
  statistics?: {
    viewCount?: string;
    commentCount?: string;
    likeCount?: string;
  };
}

export interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    thumbnails?: { medium?: { url?: string } };
    channelTitle: string;
    publishedAt?: string;
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
