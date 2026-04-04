import React from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  matchFn: (pathname: string, params: URLSearchParams) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: '홈',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    ),
    matchFn: (pathname, params) =>
      pathname === '/' && !params.get('category'),
  },
  {
    path: '/daily-report',
    label: '리포트',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    matchFn: (pathname) => pathname.startsWith('/daily-report'),
  },
  {
    path: '/?category=movie',
    label: '영화/공연',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    ),
    matchFn: (pathname, params) =>
      pathname === '/' && (params.get('category') === 'movie' || params.get('category') === 'performance'),
  },
  {
    path: '/keywords',
    label: '이슈태그',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
    matchFn: (pathname) => pathname === '/keywords',
  },
  {
    path: '/weather',
    label: '날씨',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
    matchFn: (pathname) => pathname === '/weather',
  },
];

export const MobileBottomNav: React.FC = () => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 sm:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-14">
        {NAV_ITEMS.map(({ path, label, icon, matchFn }) => {
          const active = matchFn(pathname, searchParams);
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {icon}
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
