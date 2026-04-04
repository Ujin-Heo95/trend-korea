import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const LoginButton: React.FC = () => {
  const { loginWithKakao, loginWithGoogle } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        로그인
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 py-1">
            <button
              onClick={() => { loginWithKakao(); setShowMenu(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <span className="w-5 h-5 bg-yellow-400 rounded-sm flex items-center justify-center text-xs font-bold text-yellow-900">K</span>
              카카오로 로그인
            </button>
            <button
              onClick={() => { loginWithGoogle(); setShowMenu(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <span className="w-5 h-5 bg-white border border-slate-300 rounded-sm flex items-center justify-center text-xs font-bold text-slate-600">G</span>
              구글로 로그인
            </button>
          </div>
        </>
      )}
    </div>
  );
};
