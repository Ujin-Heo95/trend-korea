import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchComments, createComment } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { CommentForm } from './CommentForm';
import { CommentItem } from './CommentItem';

interface Props {
  postId: number;
}

type SortOption = 'best' | 'new' | 'old';

const SORT_LABELS: Record<SortOption, string> = {
  best: '추천순',
  new: '최신순',
  old: '오래된순',
};

export const CommentSection: React.FC<Props> = ({ postId }) => {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<SortOption>('best');
  const token = session?.access_token;

  const { data, isLoading } = useQuery({
    queryKey: ['comments', postId, sort],
    queryFn: () => fetchComments(postId, sort, token),
    staleTime: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['comments', postId] });
  };

  const handleCreate = async (body: string) => {
    if (!token) return;
    await createComment(postId, body, token);
    refresh();
  };

  const handleReply = async (parentId: number, body: string) => {
    if (!token) return;
    await createComment(postId, body, token, parentId);
    refresh();
  };

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          댓글 {data?.total ? `(${data.total})` : ''}
        </h3>
        <div className="flex gap-1">
          {(Object.keys(SORT_LABELS) as SortOption[]).map(opt => (
            <button
              key={opt}
              onClick={() => setSort(opt)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                sort === opt
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {SORT_LABELS[opt]}
            </button>
          ))}
        </div>
      </div>

      {/* Write comment */}
      {profile ? (
        <div className="mb-6">
          <CommentForm onSubmit={handleCreate} placeholder="댓글을 남겨보세요..." />
        </div>
      ) : (
        <div className="mb-6 text-center py-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            댓글을 작성하려면 로그인해주세요.
          </p>
        </div>
      )}

      {/* Comment list */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-400 animate-pulse">댓글 로딩 중...</div>
      ) : data?.comments.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {data?.comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              postId={postId}
              onReply={handleReply}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}
    </section>
  );
};
