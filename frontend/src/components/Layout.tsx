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

interface Props {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Layout: React.FC<Props> = ({ children, searchQuery, onSearchChange }) => {
  return (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xl font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">위클릿</Link>
          <span className="text-sm text-slate-400 dark:text-slate-500 hidden sm:inline">실시간 트렌드 모아보기</span>
          <LivePulse />
          <StreakBadge />
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
            to="/bookmarks"
            className="text-xs font-medium px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors hidden sm:inline-block"
          >
            북마크
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <SearchBar value={searchQuery} onChange={onSearchChange} />
          <ThemeToggle />
        </div>
      </div>
    </header>
    <main id="main-content" role="tabpanel" className="max-w-5xl mx-auto px-4 py-6 pb-28 sm:pb-6">{children}</main>
    <Footer />
    <div className="sm:hidden fixed bottom-14 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-700">
      <AdSlot slotId="mobile-sticky" format="banner" />
    </div>
    <MobileBottomNav />
    <ScrollToTop />
  </div>
  );
};
