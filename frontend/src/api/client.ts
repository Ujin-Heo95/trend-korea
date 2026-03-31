import axios from 'axios';
import type { Post, Source, PostsResponse, DailyReport, DailyReportMeta, WeatherResponse, CityInfo, KeywordStatsResponse, TrendSignalsResponse, IssueDetailResponse } from '../types';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
const api = axios.create({ baseURL });

export const fetchPosts = (params: { source?: string; category?: string; q?: string; sort?: string; page?: number; limit?: number }) =>
  api.get<PostsResponse>('/posts', { params }).then(r => r.data);

export const fetchTrending = () =>
  api.get<{ posts: Post[] }>('/posts/trending').then(r => r.data);

export const fetchSources = () =>
  api.get<Source[]>('/sources').then(r => r.data);

export const fetchDailyReport = (date: string) =>
  api.get<DailyReport>(`/daily-report/${date}`).then(r => r.data);

export const fetchLatestReport = () =>
  api.get<DailyReportMeta | null>('/daily-report/latest').then(r => r.data);

export const fetchWeather = (cityCode: string) =>
  api.get<WeatherResponse>(`/weather/${cityCode}`).then(r => r.data);

export const fetchCities = () =>
  api.get<CityInfo[]>('/weather/cities').then(r => r.data);

export const fetchKeywordStats = (window: number = 3) =>
  api.get<KeywordStatsResponse>('/keywords', { params: { window } }).then(r => r.data);

export const fetchTrendSignals = () =>
  api.get<TrendSignalsResponse>('/trends/signals').then(r => r.data);

export const fetchIssueDetail = (postId: number) =>
  api.get<IssueDetailResponse>(`/posts/${postId}`).then(r => r.data);

export const postVote = (postId: number) =>
  api.post<{ vote_count: number; voted: boolean; already_voted: boolean }>(`/posts/${postId}/vote`).then(r => r.data);
