import React, { useState } from 'react';
import { useConfigGroups, useConfigGroup, useSaveConfig, useResetConfig } from '../../hooks/useScoringConfig';
import { ConfigGroupEditor } from './ConfigGroupEditor';

interface Props {
  readonly token: string;
}

export function ScoringConfigPanel({ token }: Props) {
  const { data: groups, isLoading: groupsLoading } = useConfigGroups(token);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // 첫 로드 시 첫 그룹 선택
  React.useEffect(() => {
    if (groups && groups.length > 0 && !activeGroup) {
      setActiveGroup(groups[0].groupName);
    }
  }, [groups, activeGroup]);

  const { data: groupDetail, isLoading: detailLoading } = useConfigGroup(token, activeGroup);
  const saveMutation = useSaveConfig(token);
  const resetMutation = useResetConfig(token);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = (values: Record<string, unknown>) => {
    if (!activeGroup) return;
    saveMutation.mutate(
      { group: activeGroup, values },
      {
        onSuccess: () => showToast('success', '저장 완료 — 다음 스코어링 사이클에 반영됩니다'),
        onError: (err) => showToast('error', err instanceof Error ? err.message : '저장 실패'),
      },
    );
  };

  const handleReset = () => {
    if (!activeGroup) return;
    resetMutation.mutate(activeGroup, {
      onSuccess: () => showToast('success', '기본값으로 복원됨'),
      onError: (err) => showToast('error', err instanceof Error ? err.message : '복원 실패'),
    });
  };

  if (groupsLoading) {
    return <p className="text-slate-400 animate-pulse py-8 text-center">설정 그룹 로딩 중...</p>;
  }

  if (!groups || groups.length === 0) {
    return <p className="text-slate-400 py-8 text-center">설정 그룹을 불러올 수 없습니다</p>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Group Tabs — 세로 (데스크톱) / 가로 스크롤 (모바일) */}
      <div className="lg:w-56 shrink-0">
        <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
          {groups.map(g => (
            <button
              key={g.groupName}
              onClick={() => setActiveGroup(g.groupName)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium text-left whitespace-nowrap transition-colors ${
                activeGroup === g.groupName
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <span className="block">{g.label}</span>
              <span className={`text-xs ${activeGroup === g.groupName ? 'text-blue-200' : 'text-slate-400'}`}>
                {g.fieldCount}개 설정
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor Panel */}
      <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        {detailLoading ? (
          <p className="text-slate-400 animate-pulse py-8 text-center">로딩 중...</p>
        ) : groupDetail ? (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{groupDetail.label}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{groupDetail.description}</p>
            </div>
            <ConfigGroupEditor
              fields={groupDetail.fields}
              onSave={handleSave}
              onReset={handleReset}
              isSaving={saveMutation.isPending}
            />
          </>
        ) : (
          <p className="text-slate-400 py-8 text-center">그룹을 선택하세요</p>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
