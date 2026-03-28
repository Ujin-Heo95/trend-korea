import React from 'react';
import { useSources } from '../hooks/usePosts';

interface Props {
  selected: string | undefined;
  onChange: (k: string | undefined) => void;
}

export const SourceFilter: React.FC<Props> = ({ selected, onChange }) => {
  const { data: sources = [] } = useSources();

  const btn = (label: string, key: string | undefined) => (
    <button
      key={label}
      onClick={() => onChange(key)}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        selected === key
          ? 'bg-blue-600 text-white'
          : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {btn('전체', undefined)}
      {sources.map(s => btn(s.name, s.key))}
    </div>
  );
};
