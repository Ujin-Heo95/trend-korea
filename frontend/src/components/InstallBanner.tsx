import React from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export const InstallBanner: React.FC = () => {
  const { variant, visible, promptInstall, dismiss } = useInstallPrompt();

  if (!visible || !variant) return null;

  return (
    <div
      role="dialog"
      aria-label="홈 화면에 위클릿 추가"
      className="fixed inset-x-0 bottom-0 z-50 sm:hidden"
    >
      <div className="mx-3 mb-3 rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
        <img
          src="/brand_logo_mini.png"
          alt=""
          width={48}
          height={48}
          className="w-12 h-12 rounded-xl bg-white shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            위클릿을 홈 화면에 추가
          </p>
          {variant === 'android' ? (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              앱처럼 빠르게 실시간 트렌드 확인
            </p>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
              아래 <span aria-hidden>⬆</span> 공유 → <strong>홈 화면에 추가</strong>
            </p>
          )}
        </div>
        {variant === 'android' && (
          <button
            type="button"
            onClick={promptInstall}
            className="shrink-0 px-4 py-2 rounded-full bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
          >
            설치
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="닫기"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </div>
    </div>
  );
};
