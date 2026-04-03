import React, { useState } from 'react';

interface Props {
  postId: number;
  voteCount: number;
  hasVoted: boolean;
  onVote: (postId: number, onCountUpdate?: (count: number) => void) => void;
  size?: 'sm' | 'md';
}

export const VoteButton: React.FC<Props> = ({ postId, voteCount, hasVoted, onVote, size = 'sm' }) => {
  const [displayCount, setDisplayCount] = useState(voteCount);
  const [animating, setAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasVoted) return;

    setDisplayCount(prev => prev + 1);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);

    onVote(postId, (serverCount) => setDisplayCount(serverCount));
  };

  const isMd = size === 'md';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={hasVoted}
      className={`inline-flex items-center gap-1 rounded-full transition-all ${
        hasVoted
          ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 cursor-default'
          : 'text-slate-400 dark:text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer'
      } ${isMd ? 'px-3 py-1.5 text-sm' : 'px-1.5 py-0.5 text-xs'}`}
      aria-label={hasVoted ? '추천함' : '추천'}
      title={hasVoted ? '추천함' : '추천'}
    >
      <svg
        className={`${isMd ? 'w-4 h-4' : 'w-3.5 h-3.5'} transition-transform ${animating ? 'scale-125' : ''}`}
        fill={hasVoted ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
      {displayCount > 0 && (
        <span>{displayCount.toLocaleString()}</span>
      )}
    </button>
  );
};
