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
    path: '/fortune',
    label: '운세',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    matchFn: (pathname) => pathname === '/fortune',
  },
];

export const MobileBottomNav: React.FC = () => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 sm:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-12">
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
              <span className="text-xs font-normal">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
