import React from 'react';
import type { Post } from '../../types';
import { useBookmarks } from '../../hooks/useBookmarks';

interface Props {
  post: Post;
}

export const BookmarkButton: React.FC<Props> = ({ post }) => {
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const bookmarked = isBookmarked(post.id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleBookmark(post);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex items-center text-xs px-1.5 py-0.5 rounded transition-colors ${
        bookmarked
          ? 'text-amber-500 dark:text-amber-400'
          : 'text-slate-400 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400'
      }`}
      aria-label={bookmarked ? '북마크 해제' : '북마크'}
      title={bookmarked ? '북마크 해제' : '북마크'}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
};
