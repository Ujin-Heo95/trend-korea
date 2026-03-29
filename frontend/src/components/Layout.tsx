import React from 'react';
import { SearchBar } from './SearchBar';

interface Props {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Layout: React.FC<Props> = ({ children, searchQuery, onSearchChange }) => (
  <div className="min-h-screen bg-slate-50">
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-slate-900">실시간 이슈</span>
          <span className="text-sm text-slate-400 hidden sm:inline">한국 주요 커뮤니티 모아보기</span>
        </div>
        <SearchBar value={searchQuery} onChange={onSearchChange} />
      </div>
    </header>
    <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
  </div>
);
