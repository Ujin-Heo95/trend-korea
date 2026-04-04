import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-8">
      <div className="max-w-5xl mx-auto px-4 py-6 text-xs text-slate-400 dark:text-slate-500">
        {/* SEO 내부 링크 */}
        <nav className="flex flex-wrap gap-x-4 gap-y-1 mb-4 justify-center">
          <Link to="/weather" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">날씨</Link>
        </nav>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>&copy; {new Date().getFullYear()} 위클릿. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/about" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">서비스 소개</Link>
            <Link to="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">개인정보처리방침</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
