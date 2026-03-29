import axios from 'axios';
import type { Post, Source, PostsResponse } from '../types';

const isProd = window.location.hostname !== 'localhost';
const api = axios.create({ baseURL: isProd ? 'https://trend-korea-production.up.railway.app/api' : '/api' });

export const fetchPosts = (params: { source?: string; category?: string; q?: string; page?: number; limit?: number }) =>
  api.get<PostsResponse>('/posts', { params }).then(r => r.data);

export const fetchTrending = () =>
  api.get<{ posts: Post[] }>('/posts/trending').then(r => r.data);

export const fetchSources = () =>
  api.get<Source[]>('/sources').then(r => r.data);
