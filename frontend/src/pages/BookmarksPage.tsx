import React from 'react';
import { Link } from 'react-router-dom';
import { useBookmarks } from '../hooks/useBookmarks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { optimizedImage } from '../utils/imageProxy';
import { timeAgo } from '../utils/timeAgo';

export const BookmarksPage: React.FC = () => {
  useDocumentTitle('북마크');
  const { bookmarks, toggleBookmark } = useBookmarks();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <div className="mb-6">
        <Link to="/" className="text-sm text-slate-400 dark:text-slate-500 hover:text-blue-600 mb-2 inline-block">
          &larr; 홈으로
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">북마크</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          저장한 글 {bookmarks.length}개
        </p>
      </div>

      {bookmarks.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400 text-lg mb-1">아직 저장한 글이 없습니다</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">글 목록에서 북마크 아이콘을 눌러 저장하세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookmarks.map(post => (
            <div
              key={post.id}
              className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              {post.thumbnail && (
                <div className="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                  <img
                    src={optimizedImage(post.thumbnail, 128)}
                    alt={post.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{post.source_name}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(post.saved_at)}</span>
                </div>
                <Link
                  to={`/issue/${post.id}`}
                  className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2 transition-colors"
                >
                  {post.title}
                </Link>
              </div>
              <button
                type="button"
                onClick={() => toggleBookmark({ id: post.id, title: post.title, source_name: post.source_name, url: post.url, thumbnail: post.thumbnail } as any)}
                className="flex-shrink-0 text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors p-1"
                aria-label="북마크 해제"
                title="북마크 해제"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BookmarksPage;
