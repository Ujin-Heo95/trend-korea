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
  vote_count: number;
  published_at?: string;
  scraped_at: string;
  category?: Category;
  cluster_size?: number;
  cluster_id?: number | null;
  related_sources?: { id: number; source_name: string; source_key: string; url: string }[];
  metadata?: Record<string, unknown>;
  keywords?: string[];
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

// ── 토픽 종합 ──────────────────────────────────────────
export interface TopicPost {
  id: number;
  title: string;
  sourceKey: string;
  sourceName: string;
}

export interface Topic {
  id: string;
  headline: string;
  keywords: string[];
  channels: string[];
  postCount: number;
  momentum: 'rising' | 'steady' | 'falling';
  momentumValue: number;
  convergenceScore: number;
  representativePosts: TopicPost[];
}

export interface TopicsResponse {
  topics: Topic[];
}

// ── 빅카인즈 오늘의 이슈 ────────────────────────────────
export interface BigKindsRelatedPost {
  id: number;
  title: string;
  url: string;
  source_name: string;
  source_key: string;
}

export interface BigKindsIssue {
  rank: number;
  keyword: string;
  articleCount: number;
  period: string;
  bigkindsUrl: string;
  relatedPosts: BigKindsRelatedPost[];
}

export interface TrendSignalsResponse {
  issues: BigKindsIssue[];
}

// ── 레거시 교차 검증 (이슈 상세에서 사용) ────────────────
export interface GoogleArticle {
  title: string;
  url: string;
  source: string;
}

// ── 이슈 상세 ───────────────────────────────────────────
export interface IssueDetailResponse {
  post: Omit<Post, 'cluster_size' | 'cluster_id' | 'related_sources'>;
  trend_score: number | null;
  cluster_members: {
    id: number; source_key: string; source_name: string; title: string; url: string;
    view_count: number; comment_count: number; published_at: string | null;
  }[];
  trend_signals: {
    id: number; keyword: string; google_traffic: string | null;
    naver_change_pct: number | null;
    naver_trend_data: { period: string; ratio: number }[] | null;
    convergence_score: number; signal_type: string;
    google_articles: GoogleArticle[];
  }[];
  engagement_history: { view_count: number; comment_count: number; captured_at: string }[];
  related_articles: { id: number; title: string; url: string; source_name: string; source_key: string; thumbnail: string | null }[];
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
