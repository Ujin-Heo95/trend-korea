import { useState } from 'react';
import type { FeatureFlagsInfo } from '../../api/admin';
import { useToggleFeatureFlag, type FlagKey } from '../../hooks/useFeatureFlags';

const FLAG_LABELS: Record<FlagKey, string> = {
  embeddings_enabled: '임베딩 (유사도)',
  gemini_summary_enabled: 'Gemini 요약',
  cross_validation_enabled: '교차 검증',
  apify_scrapers_enabled: 'Apify SNS',
};

export function FeatureFlagPanel({ flags, token }: { flags: FeatureFlagsInfo; token: string }) {
  const toggleMutation = useToggleFeatureFlag(token);
  const [confirming, setConfirming] = useState<{ key: FlagKey; newValue: boolean } | null>(null);

  const handleToggle = (key: FlagKey) => {
    setConfirming({ key, newValue: !flags[key] });
  };

  const confirmToggle = () => {
    if (!confirming) return;
    toggleMutation.mutate({ key: confirming.key, value: confirming.newValue });
    setConfirming(null);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">피처 플래그</h2>
      <div className="flex flex-wrap gap-3">
        {(Object.keys(FLAG_LABELS) as FlagKey[]).map(key => {
          const enabled = flags[key];
          return (
            <button
              key={key}
              onClick={() => handleToggle(key)}
              disabled={toggleMutation.isPending}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                enabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              } hover:opacity-80`}
            >
              <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {FLAG_LABELS[key]}
              <span className="font-bold">{enabled ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">피처 플래그 변경</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>{FLAG_LABELS[confirming.key]}</strong>를{' '}
              <span className={confirming.newValue ? 'text-emerald-600' : 'text-red-500'}>
                {confirming.newValue ? '활성화' : '비활성화'}
              </span>
              하시겠습니까?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmToggle}
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                  confirming.newValue ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirming.newValue ? '활성화' : '비활성화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
