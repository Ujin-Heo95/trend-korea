import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIssueRankingDetail } from '../hooks/usePosts';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { getSourceColor } from '../constants/sourceColors';
import { ErrorRetry } from '../components/shared/ErrorRetry';
import { AdSlot } from '../components/shared/AdSlot';
import { IssueDetailSkeleton } from '../components/shared/IssueDetailSkeleton';
import { optimizedImage } from '../utils/imageProxy';
import type { IssueRelatedPost } from '../types';

export const IssueDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const issueId = parseInt(postId ?? '0');
  const { data, isLoading, isError, refetch } = useIssueRankingDetail(issueId);

  useDocumentTitle(data?.issue.title ?? '이슈 상세');

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  if (isLoading) return <IssueDetailSkeleton />;

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorRetry message="이슈를 찾을 수 없습니다" onRetry={refetch} />
        <div className="text-center mt-4">
          <Link to="/" className="text-blue-500 hover:underline text-sm">홈으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  const { issue, news_posts, community_posts, video_posts, matched_keywords, sns_keywords } = data;

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

      {/* Issue header */}
      <article>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {issue.category_label && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {issue.category_label}
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-snug mb-3">
          {issue.title}
        </h1>

        {issue.thumbnail && (
          <img
            src={optimizedImage(issue.thumbnail, 640)}
            alt={issue.title}
            className="w-full max-h-48 sm:max-h-64 object-cover rounded-xl mb-4"
            loading="lazy"
            decoding="async"
          />
        )}

        {issue.summary && (
          <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed mb-6">
            {issue.summary}
          </p>
        )}
      </article>

      {/* Related news posts */}
      {news_posts.length > 0 && (
        <PostSection label="뉴스" posts={news_posts} />
      )}

      {/* Related video posts */}
      {video_posts.length > 0 && (
        <PostSection label="영상" posts={video_posts} />
      )}

      {/* Related community posts */}
      {community_posts.length > 0 && (
        <PostSection label="커뮤니티" posts={community_posts} />
      )}

      {/* Portal trend keywords */}
      {matched_keywords.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">포털 트렌드</h2>
          <div className="flex flex-wrap gap-1.5">
            {matched_keywords.map(kw => (
              <span key={kw} className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                {kw}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* SNS trend keywords */}
      {sns_keywords.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">SNS 트렌드</h2>
          <div className="flex flex-wrap gap-1.5">
            {sns_keywords.map(kw => (
              <span key={kw} className="text-xs px-2.5 py-1 rounded-full bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                {kw}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Ad slot */}
      <AdSlot slotId="issue-detail" format="rectangle" className="my-6" />

    </div>
  );
};

// ─── Post Section ───

const PostSection: React.FC<{ label: string; posts: IssueRelatedPost[] }> = ({ label, posts }) => (
  <section className="mb-6">
    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
      {label} ({posts.length})
    </h2>
    <div className="space-y-2">
      {posts.map(post => (
        <a
          key={post.id}
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
        >
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getSourceColor(post.source_key, null)}`}>
            {post.source_name}
          </span>
          <span className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1 flex-1">{post.title}</span>
          {post.view_count > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 tabular-nums">
              {post.view_count.toLocaleString()}
            </span>
          )}
        </a>
      ))}
    </div>
  </section>
);

export default IssueDetailPage;
