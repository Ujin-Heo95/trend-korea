import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveConfigGroup } from '../api/adminConfig';
import type { FeatureFlagsInfo } from '../api/admin';

export type FlagKey = keyof FeatureFlagsInfo;

export function useToggleFeatureFlag(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: FlagKey; value: boolean }) =>
      saveConfigGroup(token, 'feature_flags', { [key]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-health'] });
      queryClient.invalidateQueries({ queryKey: ['admin-config-group', 'feature_flags'] });
    },
  });
}
