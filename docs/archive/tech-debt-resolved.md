# 기술 부채 — 해결됨

> 2026-03-29 종합 코드 리뷰에서 발견, 동일 시점 해결.

## 백엔드 Critical/High (전부 해결)

- **Dual Pool 버그** (P0) — `server.ts`의 `new Pool()` 삭제, `db/client.ts` pool 통일
- **스크래퍼 중복 실행** (P0) — `runningLocks` Map + 30초 타임아웃
- **Graceful Shutdown** (P1) — SIGTERM/SIGINT 핸들러 추가
- **DB 100MB 한도** (P0) — POST_TTL_DAYS 3, cleanup 2회/일 + Supabase 500MB 마이그레이션 완료
- **try-catch return []** (P1) — throw로 변경
- **Gemini 쿼터 초과** (P1) — 배치 크기 축소, 동시성 1, 딜레이 추가

## 프론트엔드 High (전부 해결)

- **Tailwind CDN** (P0) → v4 PostCSS 빌드 (300KB → 17KB)
- **필터 상태 URL 미반영** (P0) → `useSearchParams` 동기화
- **vite.config.ts define 충돌** (P0) → define 블록 삭제
- **SEO 메타 태그 전무** (P1) → 정적 OG/meta/canonical/robots/sitemap
- **에러 바운더리 없음** (P1) → ErrorBoundary + QueryClient retry
- **이미지 최적화 부재** (P1) → lazy loading + 크기 지정
- **useTrending staleTime** → QueryClient 전역 설정
