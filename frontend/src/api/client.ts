import axios from 'axios';
import type { Post, Source, PostsResponse, WeatherResponse, CityInfo, IssueDetailResponse, IssueRankingResponse, IssueRankingDetailResponse } from '../types';

export interface Comment {
  id: number;
  post_id: number;
  user_id: string;
  parent_id: number | null;
  depth: number;
  body: string;
  is_deleted: boolean;
  vote_score: number;
  user_vote: number | null;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  children: Comment[];
}

export interface CommentsResponse {
  comments: Comment[];
  total: number;
}

export interface CommentVoteResponse {
  vote_score: number;
  user_vote: number | null;
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
const api = axios.create({ baseURL });

export const fetchPosts = (params: { source?: string; category?: string; subcategory?: string; q?: string; sort?: string; page?: number; limit?: number }) =>
  api.get<PostsResponse>('/posts', { params }).then(r => r.data);

export const fetchTrending = () =>
  api.get<{ posts: Post[] }>('/posts/trending').then(r => r.data);

export const fetchSources = () =>
  api.get<Source[]>('/sources').then(r => r.data);

export const fetchWeather = (cityCode: string) =>
  api.get<WeatherResponse>(`/weather/${cityCode}`).then(r => r.data);

export const fetchCities = () =>
  api.get<CityInfo[]>('/weather/cities').then(r => r.data);

export const fetchIssueDetail = (postId: number) =>
  api.get<IssueDetailResponse>(`/posts/${postId}`).then(r => r.data);

export const fetchIssueRankings = (params?: { page?: number; limit?: number }) =>
  api.get<IssueRankingResponse>('/issues', { params }).then(r => r.data);

export const fetchIssueRankingDetail = (issueId: number) =>
  api.get<IssueRankingDetailResponse>(`/issues/${issueId}`).then(r => r.data);

export const postVote = (postId: number) =>
  api.post<{ vote_count: number; is_new_vote: boolean }>(`/posts/${postId}/vote`).then(r => r.data);

export const fetchComments = (postId: number, sort: string, token?: string) =>
  api.get<CommentsResponse>(`/posts/${postId}/comments`, {
    params: { sort },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).then(r => r.data);

export const createComment = (postId: number, body: string, token: string, parentId?: number) =>
  api.post<Comment>(`/posts/${postId}/comments`, { body, parent_id: parentId ?? null }, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.data);

export const voteComment = (commentId: number, voteType: 1 | -1, token: string) =>
  api.post<CommentVoteResponse>(`/comments/${commentId}/vote`, { vote_type: voteType }, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.data);

export const deleteComment = (commentId: number, token: string) =>
  api.delete(`/comments/${commentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.data);
