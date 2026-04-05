import React, { useState, useMemo, useCallback } from 'react';
import type { ConfigFieldValue } from '../../api/adminConfig';

interface Props {
  readonly fields: readonly ConfigFieldValue[];
  readonly onSave: (values: Record<string, unknown>) => void;
  readonly onReset: () => void;
  readonly isSaving: boolean;
}

// ─── Number Field ─────────────────────────────────

function NumberField({
  field, value, onChange,
}: {
  field: ConfigFieldValue; value: number; onChange: (v: number) => void;
}) {
  const isModified = value !== field.defaultValue;
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="flex-1 min-w-0">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{field.label}</label>
        {field.description && <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          min={field.min}
          max={field.max}
          step={field.step ?? 0.1}
          className={`w-24 px-3 py-1.5 rounded-lg border text-sm text-right font-mono
            ${isModified
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'}
            text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {isModified && (
          <span className="text-xs text-slate-400 whitespace-nowrap">기본: {field.defaultValue as number}</span>
        )}
      </div>
    </div>
  );
}

// ─── Array Field ──────────────────────────────────

function ArrayField({
  field, value, onChange,
}: {
  field: ConfigFieldValue; value: number[]; onChange: (v: number[]) => void;
}) {
  return (
    <div className="py-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{field.label}</label>
      {field.description && <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {value.map((v, i) => {
          const defaultArr = field.defaultValue as number[];
          const isModified = v !== defaultArr[i];
          return (
            <div key={i} className="flex flex-col items-center">
              <span className="text-xs text-slate-400 mb-1">[{i}]</span>
              <input
                type="number"
                value={v}
                onChange={e => {
                  const next = [...value];
                  next[i] = Number(e.target.value);
                  onChange(next);
                }}
                min={field.min}
                max={field.max}
                step={field.step ?? 0.05}
                className={`w-20 px-2 py-1.5 rounded-lg border text-sm text-center font-mono
                  ${isModified
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'}
                  text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Record Field ─────────────────────────────────

function RecordField({
  field, value, onChange,
}: {
  field: ConfigFieldValue; value: Record<string, number>; onChange: (v: Record<string, number>) => void;
}) {
  const [search, setSearch] = useState('');
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);

  const defaultRecord = field.defaultValue as Record<string, number>;
  const entries = useMemo(() => {
    let list = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(([k]) => k.toLowerCase().includes(q));
    }
    if (showModifiedOnly) {
      list = list.filter(([k, v]) => v !== defaultRecord[k]);
    }
    return list;
  }, [value, search, showModifiedOnly, defaultRecord]);

  const modifiedCount = useMemo(() =>
    Object.entries(value).filter(([k, v]) => v !== defaultRecord[k]).length
  , [value, defaultRecord]);

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{field.label}</label>
          <span className="text-xs text-slate-400 ml-2">{Object.keys(value).length}개 항목</span>
          {modifiedCount > 0 && (
            <span className="text-xs text-blue-500 ml-2">{modifiedCount}개 변경됨</span>
          )}
        </div>
      </div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="검색..."
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => setShowModifiedOnly(!showModifiedOnly)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showModifiedOnly
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}
        >
          변경된 것만
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs text-slate-500 dark:text-slate-400">키</th>
              <th className="px-3 py-2 text-right text-xs text-slate-500 dark:text-slate-400 w-28">값</th>
              <th className="px-3 py-2 text-right text-xs text-slate-500 dark:text-slate-400 w-20">기본값</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {entries.map(([key, val]) => {
              const isModified = val !== defaultRecord[key];
              return (
                <tr key={key} className={isModified ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}>
                  <td className="px-3 py-1.5 font-mono text-slate-600 dark:text-slate-300 text-xs">{key}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      value={val}
                      onChange={e => onChange({ ...value, [key]: Number(e.target.value) })}
                      min={field.min}
                      max={field.max}
                      step={field.step ?? 0.1}
                      className={`w-24 px-2 py-1 rounded border text-xs text-right font-mono
                        ${isModified
                          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                          : 'border-slate-200 dark:border-slate-600 bg-transparent'}
                        text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-slate-400 font-mono">
                    {defaultRecord[key] ?? '-'}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-400">
                  {showModifiedOnly ? '변경된 항목 없음' : '결과 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────

export function ConfigGroupEditor({ fields, onSave, onReset, isSaving }: Props) {
  // 로컬 편집 상태: field.key → 현재 편집값
  const [edits, setEdits] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) init[f.key] = f.value;
    return init;
  });

  // 서버 값과 달라진 필드가 있는지
  const hasChanges = useMemo(() => {
    for (const f of fields) {
      if (JSON.stringify(edits[f.key]) !== JSON.stringify(f.value)) return true;
    }
    return false;
  }, [edits, fields]);

  // 기본값과 다른 커스텀 값이 있는지 (리셋 버튼용)
  const hasCustomValues = fields.some(f => f.isCustom);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleSave = useCallback(() => {
    // 서버 값과 달라진 것만 전송
    const changed: Record<string, unknown> = {};
    for (const f of fields) {
      if (JSON.stringify(edits[f.key]) !== JSON.stringify(f.value)) {
        changed[f.key] = edits[f.key];
      }
    }
    if (Object.keys(changed).length > 0) onSave(changed);
  }, [edits, fields, onSave]);

  // 서버 데이터가 바뀌면 로컬 편집 상태도 동기화
  React.useEffect(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) init[f.key] = f.value;
    setEdits(init);
  }, [fields]);

  return (
    <div className="space-y-4">
      {fields.map(field => {
        if (field.type === 'number') {
          return (
            <NumberField
              key={field.key}
              field={field}
              value={edits[field.key] as number}
              onChange={v => setEdits(prev => ({ ...prev, [field.key]: v }))}
            />
          );
        }
        if (field.type === 'array') {
          return (
            <ArrayField
              key={field.key}
              field={field}
              value={edits[field.key] as number[]}
              onChange={v => setEdits(prev => ({ ...prev, [field.key]: v }))}
            />
          );
        }
        if (field.type === 'record') {
          return (
            <RecordField
              key={field.key}
              field={field}
              value={edits[field.key] as Record<string, number>}
              onChange={v => setEdits(prev => ({ ...prev, [field.key]: v }))}
            />
          );
        }
        return null;
      })}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
        {hasCustomValues && (
          <>
            {showResetConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-500">정말 기본값으로 복원하시겠습니까?</span>
                <button
                  onClick={() => { onReset(); setShowResetConfirm(false); }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
                >
                  확인
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                기본값 복원
              </button>
            )}
          </>
        )}
        {hasChanges && (
          <span className="text-xs text-blue-500 ml-auto">변경사항 있음 — 저장하지 않으면 사라집니다</span>
        )}
      </div>
    </div>
  );
}
