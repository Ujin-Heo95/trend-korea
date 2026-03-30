export type Category =
  | 'community' | 'video' | 'video_popular' | 'news' | 'tech'
  | 'finance' | 'trend' | 'government' | 'newsletter'
  | 'deals' | 'alert' | 'sports' | 'press' | 'techblog'
  | 'movie' | 'performance' | 'sns';

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
  published_at?: string;
  scraped_at: string;
  category?: Category;
  cluster_size?: number;
  cluster_id?: number | null;
  related_sources?: { source_name: string; source_key: string; url: string }[];
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

export interface DailyReportSection {
  category: Category;
  rank: number;
  summary: string | null;
  category_summary: string | null;
  post_id: number | null;
  title: string | null;
  url: string | null;
  source_name: string | null;
  view_count: number | null;
  comment_count: number | null;
  cluster_size: number | null;
}

export interface DailyReport {
  id: number;
  report_date: string;
  generated_at: string;
  status: string;
  view_count: number;
  editorial_keywords: string | null;
  editorial_briefing: string | null;
  editorial_watch_point: string | null;
  sections: DailyReportSection[];
}

export interface DailyReportMeta {
  id: number;
  report_date: string;
  generated_at: string;
  status: string;
  view_count: number;
}

// ── 키워드/이슈태그 ──────────────────────────────────────
export interface KeywordStat {
  rank: number;
  keyword: string;
  count: number;
  rate: number;
}

export interface KeywordStatsResponse {
  keywords: KeywordStat[];
  totalPosts: number;
  window: number;
  calculatedAt: string | null;
}

// ── 교차 검증 트렌드 시그널 ──────────────────────────────
export interface GoogleArticle {
  title: string;
  url: string;
  source: string;
}

export interface RelatedPost {
  id: number;
  title: string;
  url: string;
  source_name: string;
  source_key: string;
  thumbnail: string | null;
  published_at: string | null;
}

export interface TrendSignal {
  id: number;
  keyword: string;
  google_traffic: string | null;
  google_traffic_num: number;
  google_post_id: number | null;
  naver_recent: number | null;
  naver_previous: number | null;
  naver_change_pct: number | null;
  naver_trend_data: { period: string; ratio: number }[] | null;
  community_mentions: number;
  community_sources: string[];
  convergence_score: number;
  signal_type: 'confirmed' | 'google_only';
  detected_at: string;
  context_title: string | null;
  google_articles: GoogleArticle[];
  related_posts: RelatedPost[];
}

export interface TrendSignalsResponse {
  signals: TrendSignal[];
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
