import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const UserMenu: React.FC = () => {
  const { profile, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  if (!profile) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 text-sm font-medium px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
            {profile.nickname.charAt(0)}
          </span>
        )}
        <span className="hidden sm:inline text-slate-700 dark:text-slate-300">{profile.nickname}</span>
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 py-1">
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{profile.nickname}</p>
              <p className="text-xs text-slate-500">카르마 {profile.karma}</p>
            </div>
            <button
              onClick={() => { logout(); setShowMenu(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  );
};
