import React, { useState } from 'react';
import type { Comment } from '../../api/client';
import { voteComment, deleteComment } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { CommentForm } from './CommentForm';

interface Props {
  comment: Comment;
  postId: number;
  onReply: (parentId: number, body: string) => Promise<void>;
  onRefresh: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export const CommentItem: React.FC<Props> = ({ comment, postId, onReply, onRefresh }) => {
  const { session, profile } = useAuth();
  const [showReply, setShowReply] = useState(false);
  const [voteScore, setVoteScore] = useState(comment.vote_score);
  const [userVote, setUserVote] = useState<number | null>(comment.user_vote);
  const [collapsed, setCollapsed] = useState(false);

  const isOwner = profile?.id === comment.user_id;
  const token = session?.access_token;

  const handleVote = async (voteType: 1 | -1) => {
    if (!token) return;
    try {
      const res = await voteComment(comment.id, voteType, token);
      setVoteScore(res.vote_score);
      setUserVote(res.user_vote);
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!token || !confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await deleteComment(comment.id, token);
      onRefresh();
    } catch { /* ignore */ }
  };

  const handleReply = async (body: string) => {
    await onReply(comment.id, body);
    setShowReply(false);
  };

  const indent = Math.min(comment.depth, 5);

  return (
    <div style={{ marginLeft: indent * 24 }}>
      <div className="py-3 group">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          {comment.avatar_url ? (
            <img src={comment.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {comment.nickname?.charAt(0) ?? '?'}
            </span>
          )}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {comment.is_deleted ? '[삭제됨]' : comment.nickname}
          </span>
          <span className="text-xs text-slate-400">{timeAgo(comment.created_at)}</span>
          {comment.created_at !== comment.updated_at && !comment.is_deleted && (
            <span className="text-xs text-slate-400">(수정됨)</span>
          )}
          {comment.children.length > 0 && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-xs text-slate-400 hover:text-blue-500"
            >
              {collapsed ? `[+${comment.children.length}]` : '[-]'}
            </button>
          )}
        </div>

        {/* Body */}
        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
          {comment.body}
        </p>

        {/* Actions */}
        {!comment.is_deleted && (
          <div className="flex items-center gap-3 mt-1.5">
            {/* Vote buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleVote(1)}
                disabled={!token}
                className={`text-xs px-1 ${userVote === 1 ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-blue-500'} disabled:opacity-30`}
                title={token ? '추천' : '로그인 필요'}
              >
                +
              </button>
              <span className={`text-xs font-medium ${voteScore > 0 ? 'text-blue-600' : voteScore < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {voteScore}
              </span>
              <button
                onClick={() => handleVote(-1)}
                disabled={!token}
                className={`text-xs px-1 ${userVote === -1 ? 'text-red-500 font-bold' : 'text-slate-400 hover:text-red-400'} disabled:opacity-30`}
                title={token ? '비추천' : '로그인 필요'}
              >
                -
              </button>
            </div>

            {token && (
              <button
                onClick={() => setShowReply(!showReply)}
                className="text-xs text-slate-400 hover:text-blue-500"
              >
                답글
              </button>
            )}

            {isOwner && (
              <button onClick={handleDelete} className="text-xs text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                삭제
              </button>
            )}
          </div>
        )}

        {/* Reply form */}
        {showReply && (
          <div className="mt-2">
            <CommentForm
              onSubmit={handleReply}
              onCancel={() => setShowReply(false)}
              placeholder={`${comment.nickname}에게 답글...`}
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Children */}
      {!collapsed && comment.children.map(child => (
        <CommentItem
          key={child.id}
          comment={child}
          postId={postId}
          onReply={onReply}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
};
