import React, { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIssueDetail } from '../hooks/usePosts';
import { useReadPosts } from '../hooks/useReadPosts';
import { useVotes } from '../hooks/useVotes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { getSourceColor } from '../constants/sourceColors';
import { ShareButton } from '../components/shared/ShareButton';
import { VoteButton } from '../components/shared/VoteButton';
import { ErrorRetry } from '../components/shared/ErrorRetry';
import { EngagementChart } from '../components/shared/EngagementChart';
import { AdSlot } from '../components/shared/AdSlot';
import { IssueDetailSkeleton } from '../components/shared/IssueDetailSkeleton';
import { optimizedImage } from '../utils/imageProxy';
import { timeAgo } from '../utils/timeAgo';
import { formatCount } from '../utils/formatCount';

export const IssueDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const id = parseInt(postId ?? '0');
  const { data, isLoading, isError, refetch } = useIssueDetail(id);
  const { markAsRead } = useReadPosts();
  const { hasVoted, vote } = useVotes();

  useDocumentTitle(data?.post.title ?? '이슈 상세');

  // Mark as read on mount
  useEffect(() => {
    if (data?.post.url) markAsRead(data.post.url);
  }, [data?.post.url, markAsRead]);

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  if (isLoading) {
    return <IssueDetailSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorRetry message="게시글을 찾을 수 없습니다" onRetry={refetch} />
        <div className="text-center mt-4">
          <Link to="/" className="text-blue-500 hover:underline text-sm">홈으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  const { post, trend_score, cluster_members, engagement_history, category_popular } = data;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-20 sm:pb-6">
      {/* Back navigation */}
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        목록으로
      </button>

      {/* Post header */}
      <article>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getSourceColor(post.source_key, post.category)}`}>
            {post.source_name}
          </span>
          {trend_score != null && trend_score > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400">
              {trend_score >= 15 ? 'HOT' : trend_score >= 8 ? '인기' : '트렌드'}
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {timeAgo(post.published_at ?? post.scraped_at)}
          </span>
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-snug mb-1">
          {post.title}
        </h1>
        <div className="mb-3" />

        {post.thumbnail && (
          <img
            src={optimizedImage(post.thumbnail, 640)}
            alt={post.title}
            className="w-full max-h-48 sm:max-h-64 object-cover rounded-xl mb-4"
            loading="lazy"
            decoding="async"
          />
        )}

        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 mb-6">
          {post.author && <span>{post.author}</span>}
          {post.view_count > 0 && <span>조회 {formatCount(post.view_count)}</span>}
          {post.comment_count > 0 && <span>댓글 {formatCount(post.comment_count)}</span>}
          <VoteButton postId={post.id} voteCount={post.vote_count} hasVoted={hasVoted(post.id)} onVote={vote} size="md" />
        </div>
      </article>

      {/* Cluster section */}
      {cluster_members.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            이 이슈를 다루는 {cluster_members.length + 1}개 소스
          </h2>
          <div className="space-y-2">
            {cluster_members.map(m => (
              <Link
                key={m.id}
                to={`/issue/${m.id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
              >
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getSourceColor(m.source_key)}`}>
                  {m.source_name}
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1 flex-1">{m.title}</span>
                {m.view_count > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">조회 {formatCount(m.view_count)}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Engagement chart */}
      {engagement_history.length >= 2 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">조회수 추이</h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <EngagementChart data={engagement_history} />
          </div>
        </section>
      )}

      {/* Category popular */}
      {category_popular && category_popular.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">이 카테고리의 인기글</h2>
          <div className="space-y-2">
            {category_popular.map((p: { id: number; title: string; source_name: string; source_key: string; thumbnail: string | null; view_count: number }) => (
              <Link
                key={p.id}
                to={`/issue/${p.id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                {p.thumbnail && (
                  <img src={optimizedImage(p.thumbnail, 96)} alt={p.title} className="w-12 h-9 object-cover rounded flex-shrink-0" loading="lazy" decoding="async" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${getSourceColor(p.source_key)}`}>
                    {p.source_name}
                  </span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1 mt-0.5">{p.title}</p>
                </div>
                {p.view_count > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{formatCount(p.view_count)}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Ad slot */}
      <AdSlot slotId="issue-detail" format="rectangle" className="my-6" />

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-6">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm"
        >
          원문 보기
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <ShareButton
          url={`${window.location.origin}/issue/${post.id}`}
          title={post.title}
          description={`${post.source_name} — ${post.title}`}
          thumbnail={post.thumbnail ?? undefined}
        />
      </div>
    </div>
  );
};

export default IssueDetailPage;
