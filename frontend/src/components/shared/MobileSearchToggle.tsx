import React, { useState, useRef, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (q: string) => void;
}

export const MobileSearchToggle: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      // Lock body scroll while search overlay is open
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (input !== value) onChange(input);
    }, 400);
    return () => clearTimeout(timer);
  }, [input, value, onChange, open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    if (input) {
      onChange(input);
    }
  };

  const handleClear = () => {
    setInput('');
    onChange('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-500 transition-colors sm:hidden"
        aria-label="검색 열기"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-2 sm:hidden animate-scale-in">
      <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="키워드 검색..."
        className="flex-1 py-1.5 text-sm bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
      />
      {input && (
        <button
          type="button"
          onClick={handleClear}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          aria-label="검색어 지우기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={handleClose}
        className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-500 transition-colors flex-shrink-0"
      >
        닫기
      </button>
    </div>
  );
};
