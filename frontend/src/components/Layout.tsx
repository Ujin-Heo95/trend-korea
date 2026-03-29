import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from './SearchBar';
import { fetchLatestReport } from '../api/client';

interface Props {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Layout: React.FC<Props> = ({ children, searchQuery, onSearchChange }) => {
  const { data: latestReport } = useQuery({
    queryKey: ['daily-report-latest'],
    queryFn: fetchLatestReport,
    staleTime: 60_000,
  });

  return (
  <div className="min-h-screen bg-slate-50">
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xl font-bold text-slate-900 hover:text-blue-600 transition-colors">실시간 이슈</Link>
          <span className="text-sm text-slate-400 hidden sm:inline">한국 주요 커뮤니티 모아보기</span>
          {latestReport && (
            <Link
              to={`/daily-report/${String(latestReport.report_date).slice(0, 10)}`}
              className="text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors hidden sm:inline-block"
            >
              일일 리포트
            </Link>
          )}
          <Link
            to="/entertainment"
            className="text-xs font-medium px-2 py-1 rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors hidden sm:inline-block"
          >
            영화/공연
          </Link>
          <Link
            to="/weather"
            className="text-xs font-medium px-2 py-1 rounded-full bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors hidden sm:inline-block"
          >
            날씨
          </Link>
        </div>
        <SearchBar value={searchQuery} onChange={onSearchChange} />
      </div>
    </header>
    <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
  </div>
  );
};
