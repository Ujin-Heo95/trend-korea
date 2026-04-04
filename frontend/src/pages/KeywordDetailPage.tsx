import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchKeywordDetail } from '../api/client';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { getSourceColor } from '../constants/sourceColors';
import { ErrorRetry } from '../components/shared/ErrorRetry';
import { AdSlot } from '../components/shared/AdSlot';

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export const KeywordDetailPage: React.FC = () => {
  const { keyword: rawKeyword } = useParams<{ keyword: string }>();
  const keyword = decodeURIComponent(rawKeyword ?? '');

  useDocumentTitle(keyword ? `"${keyword}" 이슈` : undefined);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['keyword-detail', keyword],
    queryFn: () => fetchKeywordDetail(keyword),
    enabled: !!keyword,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-48" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorRetry message="키워드 정보를 불러올 수 없습니다" onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <Link to="/keywords" className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-500 mb-2 inline-block">
          &larr; 이슈 키워드
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          "{keyword}" 실시간 이슈
        </h1>
        {data.stats && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            최근 3시간 {data.stats.mention_count}회 언급
          </p>
        )}
      </div>

      {/* AI 분석 */}
      {data.aiExplanation && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0l2 5h5l-4 3.5 1.5 5L8 10.5 3.5 13.5 5 8.5 1 5h5z"/></svg>
            <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">AI 분석</span>
            {data.stats?.zScore != null && data.stats.zScore >= 2.0 && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                급상승
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{data.aiExplanation}</p>
        </div>
      )}

      {/* Related keywords */}
      {data.related_keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {data.related_keywords.map(kw => (
            <Link
              key={kw}
              to={`/keyword/${encodeURIComponent(kw)}`}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              {kw}
            </Link>
          ))}
        </div>
      )}

      {/* Posts */}
      {data.posts.length === 0 ? (
        <p className="text-center py-16 text-slate-400 dark:text-slate-500">
          최근 3일간 "{keyword}" 관련 이슈가 없습니다
        </p>
      ) : (
        <div className="space-y-2">
          {data.posts.map((post, i) => (
            <React.Fragment key={post.id}>
              <Link
                to={`/issue/${post.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                {post.thumbnail && (
                  <img src={post.thumbnail} alt="" className="w-14 h-10 object-cover rounded flex-shrink-0" loading="lazy" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${getSourceColor(post.source_key, post.category)}`}>
                      {post.source_name}
                    </span>
                    {post.cluster_size > 1 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium">
                        {post.cluster_size}개 소스
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-100 line-clamp-2">{post.title}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(post.scraped_at)}</span>
                </div>
              </Link>
              {(i + 1) === 5 && <AdSlot slotId="keyword-mid" format="native" className="my-2" />}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

export default KeywordDetailPage;
