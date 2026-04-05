export type Category =
  | 'community' | 'video' | 'video_popular' | 'news' | 'tech'
  | 'finance' | 'trend' | 'government' | 'newsletter'
  | 'deals' | 'alert' | 'sports' | 'press' | 'techblog'
  | 'movie' | 'performance' | 'sns' | 'travel' | 'music'
  | 'books' | 'ott';

export interface Post {
  id: number;
  source_key: string;
  source_name: string;
  title: string;
  url: string;
  thumbnail?: string;
  author?: string;
  view_count: number;
  comment_count: number;
  like_count: number;
  vote_count: number;
  published_at?: string;
  first_scraped_at: string;
  scraped_at: string;
  category: Category | null;
  cluster_size?: number;
  cluster_id?: number | null;
  related_sources?: { id: number; source_name: string; source_key: string; url: string }[];
  content_snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface Source {
  key: string;
  name: string;
  category: Category;
  post_count: number;
  last_updated: string | null;
}

export interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
}

// ── 이슈 순위 ───────────────────────────────────────────

export interface IssueRelatedPost {
  id: number;
  source_name: string;
  source_key: string;
  title: string;
  url: string;
  thumbnail: string | null;
  view_count: number;
  comment_count: number;
}

export type ChannelTag = 'news' | 'community' | 'portal' | 'sns';

export interface IssueRanking {
  id: number;
  rank: number;
  title: string;
  summary: string | null;
  category_label: string | null;
  issue_score: number;
  thumbnail: string | null;
  stable_id: string | null;
  rank_change: number | null; // null=NEW, 0=동일, +N=상승, -N=하락
  // Posts by channel
  news_posts: IssueRelatedPost[];
  community_posts: IssueRelatedPost[];
  video_posts: IssueRelatedPost[];
  // Keywords
  matched_keywords: string[];
  portal_keywords: string[];
  sns_keywords: string[];
  // Counts
  news_post_count: number;
  community_post_count: number;
  video_post_count: number;
  // Channel tags
  channel_tags: ChannelTag[];
}

export interface IssueRankingResponse {
  issues: IssueRanking[];
  total: number;
  calculated_at: string | null;
}

// ── 이슈 상세 ───────────────────────────────────────────
export interface IssueDetailResponse {
  post: Omit<Post, 'cluster_size' | 'cluster_id' | 'related_sources'>;
  trend_score: number | null;
  cluster_members: {
    id: number; source_key: string; source_name: string; title: string; url: string;
    view_count: number; comment_count: number; published_at: string | null;
  }[];
  engagement_history: { view_count: number; comment_count: number; like_count: number; captured_at: string }[];
  category_popular?: { id: number; title: string; source_name: string; source_key: string; thumbnail: string | null; view_count: number }[];
}

// ── 날씨 ─────────────────────────────────────────────────
export interface CityInfo {
  code: string;
  name: string;
}

export interface WeatherCurrent {
  temp: number;
  sky: number;
  pty: number;
  humidity: number;
  windSpeed: number;
  precipProb: number;
  precip: string;
}

export interface WeatherHourly {
  fcstDate: string;
  fcstTime: string;
  temp: number;
  sky: number;
  pty: number;
  precipProb: number;
  precip: string;
  snow: string;
  humidity: number;
  windSpeed: number;
}

export interface WeatherDaily {
  date: string;
  min: number | null;
  max: number | null;
}

export interface WeatherResponse {
  city: string;
  cityCode: string;
  baseDate: string;
  baseTime: string;
  current: WeatherCurrent;
  hourly: WeatherHourly[];
  daily: { today: WeatherDaily; tomorrow: WeatherDaily };
}
