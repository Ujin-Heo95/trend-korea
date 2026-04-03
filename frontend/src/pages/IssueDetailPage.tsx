import React, { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIssueDetail } from '../hooks/usePosts';
import { useReadPosts } from '../hooks/useReadPosts';
import { useVotes } from '../hooks/useVotes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SOURCE_COLORS } from '../constants/sourceColors';
import { ShareButton } from '../components/shared/ShareButton';
import { VoteButton } from '../components/shared/VoteButton';
import { ErrorRetry } from '../components/shared/ErrorRetry';
import { Sparkline } from '../components/shared/Sparkline';
import { EngagementChart } from '../components/shared/EngagementChart';
import { AdSlot } from '../components/shared/AdSlot';

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function trendIcon(changePct: number | null): string {
  if (changePct === null) return '';
  if (changePct > 10) return '🔥';
  if (changePct > 0) return '📈';
  if (changePct < -10) return '📉';
  if (changePct < 0) return '↘️';
  return '➡️';
}

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
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
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

  const { post, trend_score, cluster_members, trend_signals, engagement_history, related_articles, category_popular } = data;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
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
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_COLORS[post.source_key] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
            {post.source_name}
          </span>
          {trend_score != null && trend_score > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400">
              트렌드 {trend_score.toFixed(1)}
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {timeAgo(post.published_at ?? post.scraped_at)}
          </span>
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-snug mb-1">
          {post.title}
        </h1>
        {post.ai_summary && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{post.ai_summary}</p>
        )}
        {!post.ai_summary && <div className="mb-3" />}

        {post.thumbnail && (
          <img
            src={post.thumbnail}
            alt=""
            className="w-full max-h-64 object-cover rounded-xl mb-4"
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
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${SOURCE_COLORS[m.source_key] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
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

      {/* Trend signals section */}
      {trend_signals.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">관련 트렌드</h2>
          <div className="space-y-3">
            {trend_signals.map(s => (
              <div key={s.id} className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-amber-800 dark:text-amber-300">{s.keyword}</span>
                  {s.naver_change_pct !== null && (
                    <span className="text-sm">
                      {trendIcon(s.naver_change_pct)} {s.naver_change_pct > 0 ? '+' : ''}{s.naver_change_pct}%
                    </span>
                  )}
                  {s.google_traffic && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">Google {s.google_traffic}</span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    s.signal_type === 'confirmed' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  }`}>
                    {s.signal_type === 'confirmed' ? '확인됨' : 'Google'}
                  </span>
                </div>
                {s.naver_trend_data && s.naver_trend_data.length >= 2 && (
                  <Sparkline data={s.naver_trend_data} width={200} height={40} className="mb-2" />
                )}
                {s.google_articles.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {s.google_articles.slice(0, 3).map((a, i) => (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1"
                      >
                        <span className="text-slate-400 dark:text-slate-500 mr-1">{a.source}</span>
                        {a.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
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

      {/* Related articles */}
      {related_articles.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">관련 기사</h2>
          <div className="space-y-2">
            {related_articles.map(a => (
              <Link
                key={a.id}
                to={`/issue/${a.id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                {a.thumbnail && (
                  <img src={a.thumbnail} alt="" className="w-12 h-9 object-cover rounded flex-shrink-0" loading="lazy" decoding="async" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${SOURCE_COLORS[a.source_key] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                    {a.source_name}
                  </span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1 mt-0.5">{a.title}</p>
                </div>
              </Link>
            ))}
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
                  <img src={p.thumbnail} alt="" className="w-12 h-9 object-cover rounded flex-shrink-0" loading="lazy" decoding="async" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${SOURCE_COLORS[p.source_key] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
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
      <div className="flex flex-col gap-3 mt-8">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm"
        >
          원문 보기
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <div className="flex justify-center">
          <ShareButton
            url={`${window.location.origin}/issue/${post.id}`}
            title={post.title}
            description={`${post.source_name} — ${post.title}`}
            thumbnail={post.thumbnail ?? undefined}
          />
        </div>
      </div>
    </div>
  );
};

export default IssueDetailPage;
