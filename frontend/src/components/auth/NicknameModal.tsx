import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const NicknameModal: React.FC = () => {
  const { user, profile, isLoading, createProfile } = useAuth();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only show when logged in but no profile yet
  if (isLoading || !user || profile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 30) {
      setError('닉네임은 2~30자로 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createProfile(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로필 생성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          환영합니다!
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          커뮤니티에서 사용할 닉네임을 설정해주세요.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="닉네임 (2~30자)"
            maxLength={30}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
          />
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '설정 중...' : '시작하기'}
          </button>
        </form>
      </div>
    </div>
  );
};
