# 콘텐츠 랭킹 시스템 설계

> 2026-04-05 v2 — 커뮤니티·뉴스 채널별 분기 스코어링 + 외부 트렌드 신호 통합

---

## 0. 적용 범위

스코어링은 **뉴스(news/press)와 커뮤니티(community) 소스만** 대상.
나머지 탭(영상, 핫딜, 엔터테인먼트, 여행, SNS)은 최신순(scraped_at DESC)만 표시.

## 1. 트렌드 스코어링

### 1.1 공식

**커뮤니티 탭:**
```
score = normalizedEngagement × adaptiveDecay × communitySourceWeight
      × communityVelocityBonus × clusterBonus × trendSignalBonus
      × volumeDampening
```

**뉴스 탭:**
```
score = normalizedEngagement × decay × sourceWeight × subcategoryNorm
      × velocityBonus × clusterBonus × trendSignalBonus × breakingBoost
      × volumeDampening
```

- **커뮤니티**: 소스별 차등 가중치(0.8~1.4) + 소스별 적응적 감쇠(120~200분) + 댓글/좋아요 3.0× velocity
- **뉴스**: 서브카테고리 백분위 정규화(0.8~1.4) + 속보 감지(최대 3.0×) + T1~T4 소스 가중치
- **공통**: 외부 트렌드 신호 보너스(1.0~1.8) + 소스 볼륨 감쇄(하한 0.7)

### 1.2 가중치 설정

**소스 가중치** (source_weight):
| 티어 | 소스 | 가중치 |
|------|------|--------|
| T1 통신사·집계 | yna, naver_news_ranking, bigkinds_issues, youtube(정규언론) | 2.5 |
| T2 방송사+조중 | sbs, kbs, mbc, jtbc, chosun, joins | 2.2 |
| T3 주요 언론 | khan, mk, hani, donga, hankyung, ytn | 2.0 |
| T4 포털·통합 | daum_news, newsis, google_news_kr | 1.6~1.8 |
| 테크 | geeknews, yozm, etnews | 1.3~1.5 |
| 커뮤니티 (기본) | dcinside, bobaedream 등 | 1.0 |
| 핫딜 | ppomppu_hot, clien_jirum 등 | 0.9 |
| 기본 | 기타 (미등록) | 0.8 |

**커뮤니티 소스별 차등 가중치** (community_source_weight):
| 티어 | 소스 | 가중치 | 사유 |
|------|------|--------|------|
| A 바이럴 허브 | theqoo, instiz, natepann | 1.3~1.4 | 자체 필터링된 인기글, 바이럴 확산 기점 |
| B 고볼륨·고참여 | clien, dcinside, fmkorea, todayhumor | 1.1~1.2 | 베스트 게시판 필터 적용 |
| C 니치 | ppomppu, bobaedream, mlbpark, cook82, dogdrip | 1.0 | 표준 |
| D 소규모/하락세 | inven, ddanzi, humoruniv, ygosu, slrclub, etoland | 0.8~0.9 | 트래픽 감소세 |

**채널별 Decay 반감기**:
| 채널 | 반감기 | 24h후 잔여 | 사유 |
|------|--------|-----------|------|
| 뉴스 | 4h | 1.56% | 시의성 중요 |
| 커뮤니티 (기본) | 2.5h | 0.13% | 실시간 이슈 중심 |

**커뮤니티 소스별 적응적 감쇠**:
| 소스 그룹 | 반감기 | 사유 |
|-----------|--------|------|
| dcinside, fmkorea, dogdrip | 120분 | 빠른 순환 |
| theqoo, instiz, natepann, todayhumor, cook82 | 150분 | 표준 |
| ppomppu, mlbpark, inven | 180분 | 토론형 |
| clien, bobaedream | 200분 | 느린 토론형 |

**뉴스 서브카테고리 정규화** (subcategoryNorm):
- 기존 고정 categoryWeight(1.20) 대신 서브카테고리 내 백분위 랭크 [0.8, 1.4]
- 정치 1위 기사와 연예 1위 기사가 동등하게 경쟁

### 1.3 외부 트렌드 신호 통합

**트렌드 키워드 테이블** (migration 035):
- `trend_keywords`: Google Trends/Naver DataLab/BigKinds에서 추출한 키워드 (12h TTL, ~50행)
- 15분 주기로 기존 스크래퍼 데이터를 재가공 (추가 API 호출 없음)
- 포스트 타이틀과 부분문자열+바이그램 매칭 → `trendSignalBonus` [1.0, 1.8]

**속보 감지** (breakingBoost):
- 기존 `post_clusters` 활용, 30분 내 3+ 뉴스 소스 합류 시 활성화
- 30분 반감기로 감쇠: 감지 시 3.0× → 30분 후 2.0× → 120분 ~1.0×

**스코어 분해** (migration 036):
- `post_scores`에 `velocity_bonus`, `cluster_bonus`, `trend_signal_bonus` 컬럼 추가
- 디버깅·튜닝용 개별 팩터 기록

### 1.4 파일 구조

| 파일 | 역할 |
|------|------|
| `scoring.ts` | 배치 계산 오케스트레이션 |
| `scoring-weights.ts` | 소스/카테고리/커뮤니티 가중치 + 감쇠 상수 |
| `scoring-helpers.ts` | computeScore, normalizeEngagement, velocity, cluster, breaking 등 |
| `trendSignals.ts` | 외부 키워드 추출·매칭·보너스 계산 |

---

## 2. 중복 제거 (Deduplication)

### 2.1 문제

동일 사건이 여러 뉴스사에서 다른 제목으로 보도:
- 연합뉴스: "정부, 기준금리 결정" → 5000 views
- 경향신문: "기준금리 동결 결정" → 3000 views
- 매일경제: "중앙은행 금리 유지" → 2000 views

### 2.2 3단계 접근

| 단계 | 방법 | 정확도 | 비용 | 시점 |
|------|------|--------|------|------|
| **1단계** | `md5(lower(trim(title)))` 해시 | 90% (정확 일치) | $0, 5분 | Phase 2 |
| **2단계** | 배치 TF-IDF 코사인 유사도 (1시간 주기) | 75% (유사 매칭) | $0, 3시간 | Phase 5 |
| **3단계** | Transformer 임베딩 (ko-sentence-transformers) | 92% | $50/월 | 10K+ DAU |

**개발팀 판정**: pg_trgm은 INSERT 시점 비용이 높아 부적합. md5 해시가 더 효율적.

### 2.3 1단계 구현

```sql
-- migration 007
ALTER TABLE posts ADD COLUMN title_hash VARCHAR(64)
  GENERATED ALWAYS AS (md5(lower(trim(title)))) STORED;
CREATE INDEX idx_posts_title_hash ON posts(title_hash);
```

**프론트엔드 표시**:
```
[배지] 4개 언론사에서 보도
```

### 2.4 클러스터링 테이블 (2단계)

```sql
CREATE TABLE post_clusters (
  id BIGSERIAL PRIMARY KEY,
  canonical_post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  member_count INT DEFAULT 1,
  cluster_created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE post_cluster_members (
  cluster_id BIGINT NOT NULL REFERENCES post_clusters(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  similarity_to_canonical FLOAT,
  UNIQUE(cluster_id, post_id)
);
```

---

## 3. 사용자 피드백 시스템

### 3.1 원칙

- 로그인 불필요 (세션 기반)
- 최소 마찰 (3버튼: 좋아요/싫어요/북마크)
- PIPA 준수 (IP 수집 안 함, 해시된 세션 ID만)

### 3.2 DB 스키마 (migration 006)

```sql
CREATE TABLE post_reactions (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  reaction VARCHAR(16) NOT NULL,  -- 'like', 'dislike', 'bookmark'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, session_id, reaction)
);

CREATE TABLE session_profiles (
  session_id VARCHAR(64) PRIMARY KEY,
  preferred_categories TEXT[] DEFAULT '{}',
  preferred_sources TEXT[] DEFAULT '{}',
  total_clicks INT DEFAULT 0,
  last_active_at TIMESTAMPTZ
);
```

### 3.3 피드백 → 랭킹 반영

- 좋아요 비율 → `velocity_bonus` (1.0 ~ 1.3)
- CTR (클릭/노출) → 카테고리별 부스트 조정
- 세션 프로필 → "For You" 탭 개인화 (Phase 5)

### 3.4 프론트엔드

- `frontend/src/components/PostReactions.tsx` (신규)
- `frontend/src/hooks/useReaction.ts` (신규)
- `frontend/src/hooks/useSessionId.ts` (신규) — `localStorage` 기반

---

## 4. 일일 리포트 생성

### 4.1 아키텍처

```
매일 오전 7시 KST (= UTC 22:00)
  └── generateDailyReport()
        ├── 카테고리별 Top 5 포스트 쿼리 (스코어 기준)
        ├── 마크다운 렌더링
        ├── (선택) LLM 요약 생성
        └── DB 저장 + 배포 채널 큐잉
```

### 4.2 DB 스키마 (migration 008)

```sql
CREATE TABLE daily_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  markdown_content TEXT,
  status VARCHAR(32) DEFAULT 'draft',  -- draft → published → sent
  view_count INT DEFAULT 0
);

CREATE TABLE daily_report_sections (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL,
  rank INT NOT NULL,
  post_id BIGINT REFERENCES posts(id),
  summary TEXT  -- LLM 요약 (선택)
);
```

### 4.3 리포트 형식 (예시)

```markdown
# 트렌드 코리아 일일 리포트 — 2026-03-29

> 28개 소스에서 수집된 하루의 핵심 트렌드입니다.

## 📰 뉴스
1. **제목** — 연합뉴스 | 조회 12,345 | 댓글 67
2. ...

## 💻 테크
1. ...

## 💬 커뮤니티
1. ...

## 💰 금융
1. ...
```

### 4.4 배포 채널 (우선순위순)

| 채널 | 시점 | 비용 | 비고 |
|------|------|------|------|
| 웹 페이지 `/daily-report/:date` | Phase 2 | $0 | API + 프론트 페이지 |
| RSS 피드 `/feeds/daily-reports.xml` | Phase 2 | $0 | 자체 RSS 배포 |
| 이메일 뉴스레터 (Resend/Stibee) | Phase 4 | $0-20/월 | 구독자 수집 필요 |
| KakaoTalk 채널 | Phase 3 | $0 | 한국 최적 리텐션 채널 |
| Telegram 봇 | Phase 5 | $0 | 선택 |

### 4.5 LLM 요약 비용 분석

| 방법 | 비용/월 (100 리포트) | 품질 |
|------|---------------------|------|
| 없음 (큐레이션만) | $0 | 양호 (포스트 나열) |
| Claude API (Haiku) | ~$5 | 좋음 |
| Claude API (Sonnet) | ~$15 | 우수 |
| OpenAI GPT-4 Turbo | ~$20 | 우수 |
| 로컬 모델 (Llama) | $0 (셀프호스팅) | 보통 |

**권장**: Phase 2에서 큐레이션만 시작. 사용자 반응 검증 후 Phase 4에서 LLM 추가.

---

## 5. 핵심 차별화: 크로스소스 트렌드 감지

### 5.1 개념

동일 주제가 3개 이상 소스에서 동시에 등장 → "지금 한국 인터넷에서 가장 뜨거운 주제"

네이버/다음과의 차별점:
- 네이버: 뉴스만 클러스터링
- Trend Korea: 뉴스 + 커뮤니티 + SNS + 정부 발표까지 교차 분석

### 5.2 구현 (title_hash 기반)

```sql
-- 최근 6시간 내 3개 이상 소스에서 동일 title_hash
SELECT title_hash, COUNT(DISTINCT source_key) as source_count,
       ARRAY_AGG(DISTINCT source_name) as sources,
       MAX(title) as representative_title
FROM posts
WHERE scraped_at > NOW() - INTERVAL '6 hours'
GROUP BY title_hash
HAVING COUNT(DISTINCT source_key) >= 3
ORDER BY source_count DESC, MAX(view_count) DESC
LIMIT 10;
```

### 5.3 표시

- 트렌딩 섹션 상단: "🔥 N개 소스에서 동시 화제"
- PostCard 배지: "4개 언론사 보도"
- 일일 리포트: "오늘의 크로스소스 트렌드 Top 5"

---

## 6. 마이그레이션 순서

```
Phase 2: 005_trending.sql → 006_feedback.sql → 007_dedup.sql → 008_reports.sql
```

각 마이그레이션은 독립적이며 순서대로 적용. 실패 시 개별 롤백 가능.
