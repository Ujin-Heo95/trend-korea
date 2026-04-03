import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => (
  <footer className="border-t border-slate-200 bg-white mt-8">
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
      <p>&copy; {new Date().getFullYear()} 위클릿. All rights reserved.</p>
      <div className="flex gap-4">
        <Link to="/about" className="hover:text-slate-600 transition-colors">서비스 소개</Link>
        <Link to="/privacy" className="hover:text-slate-600 transition-colors">개인정보처리방침</Link>
      </div>
    </div>
  </footer>
);
