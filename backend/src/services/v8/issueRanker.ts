/**
 * v8 Issue Ranker — 클러스터 → 랭킹된 이슈 카드.
 *
 * issue_score = Σ(top-K normalizedScore) × channel_breadth_bonus
 * channel_breadth_bonus = 1.0 + 0.25 × (unique_channels - 1)   // 최대 1.75
 *
 * Cross-validation gate: news or portal ≥ 1 (community-only issue 생성 금지).
 * 대표 title: news/portal 우선, 그 중 normalizedScore 최상위.
 * thumbnail: news → portal → video → community 순.
 */

import type { V8Channel, V8Cluster, V8IssueCard, V8Post, V8PostScore } from './types.js';
import { filterMultiSourceClusters } from './postClustering.js';

const TOP_K_POSTS = 10;
const CHANNEL_BREADTH_ALPHA = 0.25;

const THUMBNAIL_PRIORITY: V8Channel[] = ['news', 'portal', 'video', 'community'];
const TITLE_PRIORITY: V8Channel[] = ['news', 'portal', 'video', 'community'];

export interface RankIssuesParams {
  readonly clusters: readonly V8Cluster[];
  readonly scores: readonly V8PostScore[];
  readonly posts: readonly V8Post[];
}

function categorizeByKeyword(title: string): string {
  const t = title.toLowerCase();
  // 기존 issueAggregator 의 keyword heuristic 을 최소 버전으로 포팅
  if (/정치|대통령|국회|선거|여당|야당/.test(t)) return '정치';
  if (/경제|주가|환율|금리|부동산|증시/.test(t)) return '경제';
  if (/연예|배우|가수|아이돌|드라마|영화/.test(t)) return '연예';
  if (/스포츠|축구|야구|올림픽|kbo|epl/i.test(t)) return '스포츠';
  if (/사건|사고|화재|범죄|재판|검찰/.test(t)) return '사회';
  if (/it|ai|기술|스타트업|it업계/i.test(t)) return 'IT';
  return '종합';
}

export function rankIssues(params: RankIssuesParams): V8IssueCard[] {
  const { clusters, scores, posts } = params;

  // 인덱스
  const scoreById = new Map<number, V8PostScore>();
  for (const s of scores) scoreById.set(s.postId, s);
  const postById = new Map<number, V8Post>();
  for (const p of posts) postById.set(p.id, p);

  // cross-source ≥ 2 필터
  const multiSource = filterMultiSourceClusters(clusters);

  const cards: V8IssueCard[] = [];
  for (const cluster of multiSource) {
    // news or portal ≥ 1 gate
    const newsCount = cluster.channelBreakdown.news;
    const portalCount = cluster.channelBreakdown.portal;
    if (newsCount + portalCount < 1) continue;

    // top-K posts by normalizedScore
    const memberScores = cluster.memberPostIds
      .map(id => scoreById.get(id))
      .filter((s): s is V8PostScore => s != null)
      .sort((a, b) => b.normalizedScore - a.normalizedScore);

    if (memberScores.length === 0) continue;

    const topK = memberScores.slice(0, TOP_K_POSTS);
    const sumTopK = topK.reduce((s, ps) => s + ps.normalizedScore, 0);
    const breadthBonus = 1.0 + CHANNEL_BREADTH_ALPHA * (cluster.uniqueChannels - 1);
    const issueScore = sumTopK * breadthBonus;

    // 대표 title: TITLE_PRIORITY 순으로 최상위 스코어 포스트
    let representativePost: V8Post | undefined;
    for (const preferredChannel of TITLE_PRIORITY) {
      const found = memberScores.find(s => {
        const p = postById.get(s.postId);
        return p?.channel === preferredChannel;
      });
      if (found) {
        representativePost = postById.get(found.postId);
        break;
      }
    }
    if (!representativePost) {
      representativePost = postById.get(memberScores[0].postId);
    }
    if (!representativePost) continue;

    // thumbnail 선택
    let thumbnail: string | null = null;
    for (const preferred of THUMBNAIL_PRIORITY) {
      const p = memberScores
        .map(s => postById.get(s.postId))
        .find(p => p?.channel === preferred && p.thumbnailUrl);
      if (p?.thumbnailUrl) {
        thumbnail = p.thumbnailUrl;
        break;
      }
    }

    cards.push({
      clusterId: cluster.id,
      title: representativePost.title,
      thumbnail,
      category: categorizeByKeyword(representativePost.title),
      issueScore,
      topPosts: topK,
      cluster,
    });
  }

  // issueScore 내림차순
  cards.sort((a, b) => b.issueScore - a.issueScore);
  return cards;
}

export const RANKER_CONSTANTS = {
  TOP_K_POSTS,
  CHANNEL_BREADTH_ALPHA,
} as const;
