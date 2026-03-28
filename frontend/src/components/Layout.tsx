import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50">
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        <span className="text-xl font-bold text-slate-900">실시간 이슈</span>
        <span className="text-sm text-slate-400">한국 주요 커뮤니티 모아보기</span>
      </div>
    </header>
    <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
  </div>
);
