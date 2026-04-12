// ─── Scoring Config Defaults ───
// 모든 스코어링 상수의 기본값, 검증 범위, 한국어 라벨 정의
// DB에 행이 없으면 이 기본값 사용 (= 현재 하드코딩 값과 동일)

export type FieldType = 'number' | 'record' | 'array';

export interface ConfigField {
  readonly key: string;
  readonly defaultValue: number | number[] | Record<string, number>;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly label: string;
  readonly description?: string;
  readonly type: FieldType;
}

export interface ConfigGroup {
  readonly groupName: string;
  readonly label: string;
  readonly description: string;
  readonly fields: readonly ConfigField[];
}

export const CONFIG_GROUPS: readonly ConfigGroup[] = [
  // ─── 1. 이슈 어그리게이터 ───
  {
    groupName: 'issue_aggregator',
    label: '이슈 어그리게이션',
    description: '전체 탭 이슈 순위 생성 파이프라인 설정',
    fields: [
      { key: 'ISSUE_WINDOW_HOURS', defaultValue: 12, min: 1, max: 48, step: 1, label: '이슈 윈도우 (시간)', description: '이슈 생성에 사용할 게시물 수집 기간', type: 'number' },
      { key: 'MAX_ISSUES', defaultValue: 30, min: 5, max: 100, step: 1, label: '최대 이슈 수', description: '전체 탭에 표시할 최대 이슈 개수', type: 'number' },
      { key: 'NEWS_WEIGHT', defaultValue: 1.0, min: 0.1, max: 5.0, step: 0.1, label: '뉴스 가중치', description: '이슈 점수에서 뉴스 점수 비중', type: 'number' },
      { key: 'COMMUNITY_WEIGHT', defaultValue: 0.6, min: 0.0, max: 5.0, step: 0.1, label: '커뮤니티 기본 가중치', description: '이슈 점수에서 커뮤니티 점수 기본 비중 (동적 조정 기준)', type: 'number' },
      { key: 'TREND_SIGNAL_WEIGHT', defaultValue: 0.4, min: 0.0, max: 5.0, step: 0.1, label: '트렌드 신호 가중치', description: '이슈 점수에서 트렌드 신호 비중', type: 'number' },
      { key: 'ISSUE_DEDUP_THRESHOLD', defaultValue: 0.55, min: 0.1, max: 1.0, step: 0.05, label: '이슈 중복제거 임계값', description: 'Jaccard 유사도 이상이면 같은 이슈로 병합', type: 'number' },
      { key: 'CONTAINMENT_THRESHOLD', defaultValue: 0.60, min: 0.3, max: 0.9, step: 0.05, label: '토큰 포함도 임계값', description: '짧은 제목 토큰의 N% 이상이 긴 제목에 포함되면 병합 후보', type: 'number' },
      { key: 'DIMINISHING_K', defaultValue: 0.7, min: 0.1, max: 2.0, step: 0.1, label: '포스트 수 체감 기울기', description: '로그 체감 수익 K값. 클수록 추가 포스트 기여 감소', type: 'number' },
      { key: 'MOMENTUM_WEIGHT', defaultValue: 0.4, min: 0.0, max: 1.0, step: 0.05, label: '모멘텀 ln 계수', description: '이슈 활성도(가속도) 반영 강도', type: 'number' },
      { key: 'MOMENTUM_PENALTY_MIN', defaultValue: 0.7, min: 0.5, max: 1.0, step: 0.05, label: '비활성 이슈 최소 승수', description: '포스트 유입이 멈춘 이슈의 최소 점수 비율', type: 'number' },
      { key: 'COMMUNITY_BOOST', defaultValue: 0.3, min: 0.0, max: 0.5, step: 0.05, label: '커뮤니티 바이럴 추가 가중치', description: '커뮤니티 반응이 폭발적일 때 추가되는 가중치 (최대)', type: 'number' },
      { key: 'DIVERSITY_CAP', defaultValue: 2.5, min: 1.0, max: 5.0, step: 0.1, label: '소스 다양성 보너스 상한', description: '이슈 레벨 교차소스 다양성 보너스 최대값', type: 'number' },
      { key: 'CROSS_SOURCE_2', defaultValue: 0.1, min: 0.0, max: 0.3, step: 0.05, label: '2채널 교차 보너스', description: '뉴스+커뮤니티 등 2개 채널 동시 등장 시 추가 보너스', type: 'number' },
      { key: 'CROSS_SOURCE_3', defaultValue: 0.2, min: 0.0, max: 0.5, step: 0.05, label: '3채널 교차 보너스', description: '뉴스+커뮤니티+영상 모두 등장 시 추가 보너스', type: 'number' },
      { key: 'BREAKING_KW_HALFLIFE', defaultValue: 30, min: 10, max: 120, step: 5, label: '속보 키워드 반감기 (분)', description: '제목에 "속보" 포함 시 부스트 감쇠 속도', type: 'number' },
      { key: 'BREAKING_KW_MAX_BOOST', defaultValue: 3.0, min: 1.5, max: 5.0, step: 0.5, label: '속보 키워드 최대 부스트', description: '제목에 "속보" 포함 시 최대 점수 승수', type: 'number' },
    ],
  },

  // ─── 2. 채널별 반감기 ───
  {
    groupName: 'channel_half_lives',
    label: '채널 반감기',
    description: '채널별 점수 감쇠 반감기 (분 단위). 작을수록 빠르게 하락',
    fields: [
      {
        key: 'values',
        defaultValue: {
          community: 150, sns: 120, news: 240, specialized: 300, video: 360,
          DEFAULT: 300,
        },
        min: 10, max: 1440, step: 10,
        label: '채널별 반감기 (분)',
        type: 'record',
      },
    ],
  },

  // ─── 3. 소스 가중치 ───
  {
    groupName: 'source_weights',
    label: '소스 가중치',
    description: '소스별 기본 가중치. 높을수록 해당 소스 게시물의 점수 상승',
    fields: [
      {
        key: 'values',
        defaultValue: {
          // T1: 통신사 + 뉴스 집계
          yna: 2.5, naver_news_ranking: 2.5, bigkinds_issues: 2.5,
          // T2: 방송사 + 조중
          sbs: 2.2, kbs: 2.2, mbc: 2.2, jtbc: 2.2, chosun: 2.2, joins: 2.2,
          // T3: 주요 언론
          khan: 2.0, mk: 2.0, hani: 2.0, donga: 2.0, hankyung: 2.0, ytn: 2.0,
          // T4: 포털·통합
          daum_news: 1.8, google_news_kr: 1.6, newsis: 1.8, ddanzi: 1.6, etnews: 2.0,
          // YouTube
          youtube: 2.5,
          // 전문매체
          yozm: 1.0,
          naver_d2: 1.1, kakao_tech: 1.1, toss_tech: 1.1,
          // 커뮤니티
          dcinside: 1.0, bobaedream: 1.0, ruliweb: 1.0, theqoo: 1.0,
          instiz: 1.0, natepann: 1.0,
          // 기타
          ppomppu: 1.0, kopis_boxoffice: 1.2, sports_donga: 1.2,
          ruliweb_hot: 0.9, clien_jirum: 0.9, quasarzone_deal: 0.9, dcinside_hotdeal: 0.9,
          DEFAULT: 0.8,
        },
        min: 0.1, max: 5.0, step: 0.1,
        label: '소스별 가중치',
        type: 'record',
      },
    ],
  },

  // ─── 4. 카테고리 가중치 ───
  {
    groupName: 'category_weights',
    label: '카테고리 가중치',
    description: '카테고리별 점수 보정 계수',
    fields: [
      {
        key: 'values',
        defaultValue: {
          alert: 1.25, news: 1.20, portal: 1.20, trend: 1.15, tech: 1.15,
          community: 1.08, video: 0.95,
          movie: 1.05, performance: 1.05, music: 1.05,
          books: 1.05, ott: 1.05,
          deals: 1.00, government: 0.85, newsletter: 0.80,
          DEFAULT: 1.00,
        },
        min: 0.1, max: 5.0, step: 0.05,
        label: '카테고리별 가중치',
        type: 'record',
      },
    ],
  },

  // ─── 5. 커뮤니티 소스 가중치 ───
  {
    groupName: 'community_source_weights',
    label: '커뮤니티 소스 가중치',
    description: '커뮤니티 채널 내부에서의 소스별 추가 가중치',
    fields: [
      {
        key: 'values',
        defaultValue: {
          // Tier A
          theqoo: 1.4, instiz: 1.35, natepann: 1.3,
          // Tier B
          clien: 1.2, dcinside: 1.15, fmkorea: 1.15, todayhumor: 1.1,
          // Tier C
          ppomppu: 1.0, bobaedream: 1.0, mlbpark: 1.0, cook82: 1.0, dogdrip: 1.0,
          // Tier D
          inven: 0.9, humoruniv: 0.85, ygosu: 0.85, slrclub: 0.8, etoland: 0.8,
          DEFAULT: 1.0,
        },
        min: 0.1, max: 5.0, step: 0.05,
        label: '커뮤니티 소스별 가중치',
        type: 'record',
      },
    ],
  },

  // ─── 6. 커뮤니티 반감기 ───
  {
    groupName: 'community_decay_half_lives',
    label: '커뮤니티 반감기',
    description: '커뮤니티 소스별 점수 감쇠 반감기 (분)',
    fields: [
      {
        key: 'values',
        defaultValue: {
          dcinside: 120, fmkorea: 120, dogdrip: 120,
          theqoo: 150, instiz: 150, natepann: 150, todayhumor: 150, cook82: 150,
          clien: 200, bobaedream: 200,
          ppomppu: 180, mlbpark: 180, inven: 180,
          DEFAULT: 150,
        },
        min: 10, max: 1440, step: 10,
        label: '커뮤니티 소스별 반감기 (분)',
        type: 'record',
      },
    ],
  },

  // ─── 7. 참여도 가중치 ───
  {
    groupName: 'engagement_weights',
    label: '참여도 가중치',
    description: '채널별 댓글/좋아요 가중치 (Z-Score 정규화에 사용)',
    fields: [
      {
        key: 'comment_weights',
        defaultValue: {
          community: 1.5, news: 0.5, video: 1.0, sns: 1.0, specialized: 1.0,
        },
        min: 0.0, max: 5.0, step: 0.1,
        label: '채널별 댓글 가중치',
        type: 'record',
      },
      {
        key: 'like_weights',
        defaultValue: {
          community: 2.0, sns: 1.5, video: 1.2, specialized: 0.8, news: 0.3,
        },
        min: 0.0, max: 5.0, step: 0.1,
        label: '채널별 좋아요 가중치',
        type: 'record',
      },
    ],
  },

  // ─── 8. 뉴스 시그널 가중치 (v7: 5항 가산 + freshness 흡수) ───
  {
    groupName: 'news_signal_weights_v7',
    label: '뉴스 시그널 가중치 (v7)',
    description: '뉴스 탭 인기순 정렬에 사용되는 5항 가산 혼합 가중치. freshness를 5번째 항으로 흡수(외곽 곱셈 제거). clusterImportance는 임베딩 centroid 거리 기반.',
    fields: [
      { key: 'portal_weight', defaultValue: 0.32, min: 0.0, max: 1.0, step: 0.05, label: '포털 랭킹 비중', description: '네이버/네이트/ZUM 뉴스 랭킹 순위의 비중', type: 'number' },
      { key: 'cluster_weight', defaultValue: 0.27, min: 0.0, max: 1.0, step: 0.05, label: '클러스터 중요도 비중', description: '임베딩 centroid 평균 거리 × 매체 티어 다양성', type: 'number' },
      { key: 'trend_weight', defaultValue: 0.18, min: 0.0, max: 1.0, step: 0.05, label: '트렌드 매칭 비중', description: '외부 트렌드 키워드 매칭 강도의 비중', type: 'number' },
      { key: 'engagement_weight', defaultValue: 0.13, min: 0.0, max: 1.0, step: 0.05, label: '참여도 신호 비중', description: '뉴스 소스 중 실제 engagement 데이터가 있는 포스트의 참여도 신호 비중', type: 'number' },
      { key: 'freshness_weight', defaultValue: 0.10, min: 0.0, max: 1.0, step: 0.05, label: '신선도 비중', description: '발행 후 경과 시간 — 45분 반감기 연속 함수, [0,10] 범위', type: 'number' },
    ],
  },

  // ─── 8-1. 뉴스 소스별 반감기 ───
  {
    groupName: 'news_decay_half_lives',
    label: '뉴스 반감기',
    description: '뉴스 소스별 점수 감쇠 반감기 (분). 통신사(빠름) → 방송(표준) → 일간지/경제지(느림)',
    fields: [
      {
        key: 'values',
        defaultValue: {
          yna: 180, newsis: 180, naver_news_ranking: 180, ytn: 200,
          sbs: 240, kbs: 240, mbc: 240, jtbc: 240,
          chosun: 300, joins: 300, donga: 300, khan: 300, hani: 300,
          mk: 320, hankyung: 320, etnews: 320,
          daum_news: 200, nate_news: 200, zum_news: 200, google_news_kr: 200,
          DEFAULT: 240,
        },
        min: 60, max: 1440, step: 10,
        label: '뉴스 소스별 반감기 (분)',
        type: 'record',
      },
    ],
  },

  // ─── 9. 트렌드 신호 ───
  {
    groupName: 'trend_signal',
    label: '트렌드 신호',
    description: '외부 트렌드 키워드 매칭 및 보너스 설정',
    fields: [
      { key: 'TREND_SIGNAL_BONUS_CAP', defaultValue: 1.8, min: 1.0, max: 5.0, step: 0.1, label: '트렌드 보너스 상한', description: '트렌드 매칭 보너스 최대값', type: 'number' },
      { key: 'MIN_KOREAN_KEYWORD_LEN', defaultValue: 2, min: 1, max: 10, step: 1, label: '한국어 키워드 최소 길이', type: 'number' },
      { key: 'MIN_LATIN_KEYWORD_LEN', defaultValue: 3, min: 1, max: 10, step: 1, label: '라틴 키워드 최소 길이', type: 'number' },
      { key: 'BASE_BONUS_BY_COUNT', defaultValue: [1.0, 1.15, 1.35, 1.6], min: 1.0, max: 3.0, step: 0.05, label: '매칭 소스 수별 기본 보너스', description: '[0소스, 1소스, 2소스, 3+소스]', type: 'array' },
      {
        key: 'temporal_decay',
        defaultValue: { '0_1h': 1.0, '1_3h': 0.95, '3_6h': 0.8, '6_12h': 0.3 },
        min: 0.0, max: 1.0, step: 0.05,
        label: '시간대별 감쇠율',
        description: '키워드 감지 시간 경과에 따른 감쇠',
        type: 'record',
      },
    ],
  },

  // ─── 9. 속보 감지 ───
  {
    groupName: 'breaking_news',
    label: '속보 감지',
    description: '여러 언론사가 동시 보도 시 적용되는 속보 부스트 설정',
    fields: [
      { key: 'DETECTION_WINDOW_HOURS', defaultValue: 2, min: 0.5, max: 12, step: 0.5, label: '감지 윈도우 (시간)', description: '클러스터 생성 후 속보로 간주하는 기간', type: 'number' },
      { key: 'MIN_SOURCES', defaultValue: 3, min: 2, max: 10, step: 1, label: '최소 소스 수', description: '속보로 판정하기 위한 최소 언론사 수', type: 'number' },
      { key: 'TIME_WINDOW_MINUTES', defaultValue: 30, min: 5, max: 120, step: 5, label: '시간 간격 (분)', description: '첫 보도~마지막 보도 간 최대 허용 간격', type: 'number' },
      { key: 'BOOST_HALF_LIFE_MINUTES', defaultValue: 30, min: 5, max: 120, step: 5, label: '부스트 반감기 (분)', description: '속보 부스트 감쇠 속도', type: 'number' },
      { key: 'MAX_BOOST', defaultValue: 3.0, min: 1.5, max: 10.0, step: 0.5, label: '최대 부스트', description: '속보 부스트 상한값', type: 'number' },
    ],
  },

  // ─── 10. 요약 큐 (TD-006) ───
  {
    groupName: 'summary_queue',
    label: '요약 큐 우선순위',
    description: 'Gemini 요약 워커가 이슈를 고르는 우선순위 공식 파라미터',
    fields: [
      { key: 'FRESHNESS_HALF_LIFE_HOURS', defaultValue: 6, min: 1, max: 48, step: 1, label: '신선도 반감기 (시간)', description: '이슈 생성 후 경과 시간에 따른 우선순위 감쇠 반감기', type: 'number' },
      { key: 'UNSUMMARIZED_PENALTY_MIN', defaultValue: 1.0, min: 1.0, max: 3.0, step: 0.1, label: '요약된 이슈 가중치', description: '이미 요약된 이슈에 적용되는 기본 승수', type: 'number' },
      { key: 'UNSUMMARIZED_PENALTY_MAX', defaultValue: 3.0, min: 1.0, max: 5.0, step: 0.1, label: '미요약 이슈 가중치', description: 'null/fallback summary에 적용되는 최대 승수', type: 'number' },
      { key: 'NOVELTY_FACTOR', defaultValue: 1.2, min: 1.0, max: 3.0, step: 0.05, label: '구성원 변경 부스트', description: '멤버십 변화율이 임계 이상일 때 적용되는 추가 승수', type: 'number' },
      { key: 'NOVELTY_THRESHOLD', defaultValue: 0.3, min: 0.1, max: 0.9, step: 0.05, label: '구성원 변경 임계값', description: '이전 tick 대비 top-post Jaccard 거리 임계값', type: 'number' },
      { key: 'PHASE_TIMEOUT_MS', defaultValue: 90000, min: 10000, max: 300000, step: 1000, label: 'phase 타임아웃 (ms)', description: '요약 phase 전체 허용 시간', type: 'number' },
      { key: 'SINGLE_CALL_TIMEOUT_MS', defaultValue: 8000, min: 1000, max: 30000, step: 500, label: '단일 호출 타임아웃 (ms)', description: '개별 Gemini 호출 AbortController 타임아웃', type: 'number' },
      { key: 'MAX_ISSUES_PER_WINDOW', defaultValue: 15, min: 1, max: 50, step: 1, label: '윈도우당 최대 이슈 수', description: '윈도우(6/12/24h)당 한 tick에서 처리할 최대 이슈 수', type: 'number' },
    ],
  },
] as const;

// ─── Utility: 그룹 이름으로 조회 ───

const GROUP_MAP = new Map(CONFIG_GROUPS.map(g => [g.groupName, g]));

export function getGroupDefaults(groupName: string): ConfigGroup | undefined {
  return GROUP_MAP.get(groupName);
}

export function getAllGroupNames(): readonly string[] {
  return CONFIG_GROUPS.map(g => g.groupName);
}
