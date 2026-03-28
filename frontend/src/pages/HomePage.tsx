import React, { useState } from 'react';
import { usePosts } from '../hooks/usePosts';
import { PostCard } from '../components/PostCard';
import { SourceFilter } from '../components/SourceFilter';

export const HomePage: React.FC = () => {
  const [src, setSrc] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = usePosts(src, page);

  const onSourceChange = (k: string | undefined) => {
    setSrc(k);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-slate-800">실시간 이슈글</h1>
        {isFetching && <span className="text-xs text-blue-500 animate-pulse">업데이트 중...</span>}
      </div>
      <SourceFilter selected={src} onChange={onSourceChange} />
      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {(data?.posts ?? []).map(post => <PostCard key={post.id} post={post} />)}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-6">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:border-blue-300"
              >이전</button>
              <span className="text-sm text-slate-600">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:border-blue-300"
              >다음</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
