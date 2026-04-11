import React from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import { MobileBottomNav } from './MobileBottomNav';
import { AdSlot } from './shared/AdSlot';
import { Footer } from './Footer';
import { ThemeToggle } from './shared/ThemeToggle';
import { LivePulse } from './shared/LivePulse';
import { StreakBadge } from './shared/StreakBadge';
import { ScrollToTop } from './shared/ScrollToTop';
import { MobileSearchToggle } from './shared/MobileSearchToggle';

interface Props {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Layout: React.FC<Props> = ({ children, searchQuery, onSearchChange }) => {
  return (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-2 sm:py-3 flex items-center justify-between gap-3">
        {/* Left: Logo + desktop-only extras */}
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xl font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">위클릿</Link>
          <span className="text-sm text-slate-400 dark:text-slate-500 hidden sm:inline">실시간 트렌드 모아보기</span>
          <span className="hidden sm:inline-flex"><LivePulse /></span>
          <span className="hidden sm:inline-flex"><StreakBadge /></span>
          <Link
            to="/?category=movie"
            className="text-xs font-medium px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors hidden sm:inline-block"
          >
            영화/공연
          </Link>
          <Link
            to="/weather"
            className="text-xs font-medium px-2 py-1 rounded-full bg-sky-50 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors hidden sm:inline-block"
          >
            날씨
          </Link>
          <Link
            to="/fortune"
            className="text-xs font-medium px-2 py-1 rounded-full bg-violet-50 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors hidden sm:inline-block"
          >
            운세
          </Link>
          <Link
            to="/games"
            className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors hidden sm:inline-block"
          >
            게임
          </Link>
        </div>

        {/* Right: Search + Theme */}
        <div className="flex items-center gap-2">
          {/* Mobile: icon toggle search */}
          <MobileSearchToggle value={searchQuery} onChange={onSearchChange} />
          {/* Desktop: inline search bar */}
          <span className="hidden sm:block">
            <SearchBar value={searchQuery} onChange={onSearchChange} />
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
    <main id="main-content" className="max-w-5xl mx-auto px-0 sm:px-4 py-2 pb-14 sm:pb-6">{children}</main>
    <Footer />
    <MobileBottomNav />
    <ScrollToTop />
  </div>
  );
};
