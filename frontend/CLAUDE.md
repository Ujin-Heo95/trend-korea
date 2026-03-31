# Frontend — React 18 + Vite 5 + Tailwind CSS v4 + TypeScript

## Conventions

- React Query v5: refetchInterval 30초, staleTime 60초 기본
- React Router 6: `useSearchParams`로 필터 상태 URL 동기화
- 코드 스플리팅: `React.lazy()` + Suspense (페이지 단위)
- 공유 컴포넌트: `src/components/shared/` (RankBadge, PosterImage, ErrorRetry, ShareButton 등)
- Tailwind v4 (PostCSS 빌드, CDN 아님)

## Key Files

| 역할 | 경로 |
|------|------|
| 프론트 홈 | `src/pages/HomePage.tsx` |
| 이슈 상세 페이지 | `src/pages/IssueDetailPage.tsx` |
| 일일 리포트 페이지 | `src/pages/DailyReportPage.tsx` |
| 이슈태그 페이지 | `src/pages/KeywordsPage.tsx` |
| 서비스 소개 | `src/pages/AboutPage.tsx` |
| 개인정보처리방침 | `src/pages/PrivacyPage.tsx` |
| API 클라이언트 | `src/api/client.ts` |
| 영화 랭킹 테이블 | `src/components/MovieRankingTable.tsx` |
| 공연 랭킹 테이블 | `src/components/PerformanceRankingTable.tsx` |
| SNS 랭킹 테이블 | `src/components/SnsRankingTable.tsx` |
| 교차 검증 UI | `src/components/TrendRadar.tsx` |
| 스파크라인 | `src/components/shared/Sparkline.tsx` |
| 참여 추이 차트 | `src/components/shared/EngagementChart.tsx` |
| 카카오 SDK 초기화 | `src/lib/kakao.ts` |
| 읽음 표시 훅 | `src/hooks/useReadPosts.ts` |
| 투표 훅 | `src/hooks/useVotes.ts` |
| 투표 버튼 | `src/components/shared/VoteButton.tsx` |
| 푸터 | `src/components/Footer.tsx` |
| CSS 엔트리 | `src/index.css` |
| ESLint 설정 | `../eslint.config.js` (모노레포 루트) |
