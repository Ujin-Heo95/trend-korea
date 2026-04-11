import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
const api = axios.create({ baseURL });

export interface UnifiedItem {
  unifiedRank: number;
  title: string;
  subtitle: string;
  thumbnail: string | null;
  url: string;
  sourceCount: number;
  metadata: Record<string, unknown>;
}

export interface CategoryResult {
  items: UnifiedItem[];
  lastUpdated: string | null;
}

export interface UnifiedResponse {
  categories: Record<string, CategoryResult>;
}

export const fetchEntertainmentUnified = () =>
  api.get<UnifiedResponse>('/entertainment/unified').then(r => r.data);

export function useEntertainmentUnified() {
  return useQuery({
    queryKey: ['entertainment', 'unified'],
    queryFn: fetchEntertainmentUnified,
    staleTime: 4.5 * 60 * 1000, // 4.5 min
    refetchInterval: 5 * 60 * 1000, // 5 min
  });
}
