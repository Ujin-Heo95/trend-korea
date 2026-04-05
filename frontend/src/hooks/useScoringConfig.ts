import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchConfigGroups,
  fetchConfigGroup,
  saveConfigGroup,
  resetConfigGroup,
} from '../api/adminConfig';

export function useConfigGroups(token: string | null) {
  return useQuery({
    queryKey: ['admin-config-groups'],
    queryFn: () => fetchConfigGroups(token!),
    enabled: !!token,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useConfigGroup(token: string | null, group: string | null) {
  return useQuery({
    queryKey: ['admin-config-group', group],
    queryFn: () => fetchConfigGroup(token!, group!),
    enabled: !!token && !!group,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useSaveConfig(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ group, values }: { group: string; values: Record<string, unknown> }) =>
      saveConfigGroup(token, group, values),
    onSuccess: (_data, { group }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-config-group', group] });
    },
  });
}

export function useResetConfig(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (group: string) => resetConfigGroup(token, group),
    onSuccess: (_data, group) => {
      queryClient.invalidateQueries({ queryKey: ['admin-config-group', group] });
    },
  });
}
