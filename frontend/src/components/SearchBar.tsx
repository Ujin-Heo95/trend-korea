import React, { useState, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (q: string) => void;
}

export const SearchBar: React.FC<Props> = ({ value, onChange }) => {
  const [input, setInput] = useState(value);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (input !== value) onChange(input);
    }, 400);
    return () => clearTimeout(timer);
  }, [input, value, onChange]);

  return (
    <div className="relative">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="키워드 검색..."
        className="w-full sm:w-64 pl-9 pr-8 py-2 text-sm bg-slate-100 dark:bg-slate-700 dark:text-slate-200 border border-transparent rounded-lg focus:bg-white dark:focus:bg-slate-600 focus:border-blue-300 dark:focus:border-blue-500 focus:outline-none transition-colors dark:placeholder-slate-400"
      />
      <svg
        className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {input && (
        <button
          type="button"
          onClick={() => { setInput(''); onChange(''); }}
          className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          aria-label="검색어 지우기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};
