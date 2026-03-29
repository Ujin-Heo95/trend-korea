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
        className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm bg-slate-100 border border-transparent rounded-lg focus:bg-white focus:border-blue-300 focus:outline-none transition-colors"
      />
      <svg
        className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
  );
};
