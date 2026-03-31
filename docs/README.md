# Trend Korea 문서

> 2026-03-31 구조 개편. 구경로 매핑은 하단 참조.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [roadmap.md](roadmap.md) | 전체 로드맵 (Phases 0-5) |
| [architecture.md](architecture.md) | 시스템 아키텍처, DB 스키마, API 엔드포인트 |
| [scoring.md](scoring.md) | 트렌드 스코어링, 중복제거, 일일 리포트 설계 |
| [sources.md](sources.md) | 스크래퍼 추가 가이드 + 소스 카탈로그 + 확장 후보 |
| [scaling.md](scaling.md) | DAU별 인프라 스케일링 전략 |
| [tech-debt.md](tech-debt.md) | 미해결 기술 부채 |
| [business/financials.md](business/financials.md) | 비용-수익 예측 모델 |
| [business/marketing.md](business/marketing.md) | 마케팅 전략, SEO, 수익화 |
| [business/legal.md](business/legal.md) | 스크래핑 법적 검토, 개인정보, 사업자등록 |
| [business/analysis-2026Q1.md](business/analysis-2026Q1.md) | 2026 Q1 종합 분석 (5개 부서 교차 검증) |
| [decisions/](decisions/) | 의사결정 기록 (TD-기술, BD-경영) |
| [archive/](archive/) | 변경이력, 해결된 기술부채, 과거 계획서 |

## 구경로 → 신경로 매핑

| 구경로 | 신경로 |
|--------|--------|
| `docs/로드맵.md` | `docs/roadmap.md` |
| `docs/dev/아키텍처.md` | `docs/architecture.md` |
| `docs/dev/콘텐츠-랭킹.md` | `docs/scoring.md` |
| `docs/dev/인프라-스케일링.md` | `docs/scaling.md` |
| `docs/dev/기술부채.md` | `docs/tech-debt.md` (미해결만) |
| `docs/dev/소스-확장-가이드.md` | `docs/sources.md` |
| `docs/dev/스크래퍼-추가-가이드.md` | `docs/sources.md` (병합) |
| `docs/dev/변경이력.md` | `docs/archive/changelog.md` |
| `docs/planning/비용-수익-예측.md` | `docs/business/financials.md` |
| `docs/planning/종합분석-2026Q1.md` | `docs/business/analysis-2026Q1.md` |
| `docs/marketing/README.md` | `docs/business/marketing.md` |
| `docs/legal/README.md` | `docs/business/legal.md` |
