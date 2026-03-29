export type Category =
  | 'community' | 'video' | 'news' | 'tech'
  | 'finance' | 'trend' | 'government' | 'newsletter'
  | 'deals' | 'alert';

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
  sections: DailyReportSection[];
}

export interface DailyReportMeta {
  id: number;
  report_date: string;
  generated_at: string;
  status: string;
  view_count: number;
}
