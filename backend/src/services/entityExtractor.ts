/**
 * entityExtractor — 한국어 뉴스 제목에서 이벤트 식별용 엔터티 토큰 추출.
 *
 * 목적: 이슈 병합 게이트의 hard-filter 신호.
 *   - 임베딩 cosine / IDF 키워드는 *토픽 수준* 신호 (둘 다 "축구" 다룸 → 높음)
 *   - 엔터티는 *이벤트 수준* 신호 (김민재 vs 황선홍 → 다른 사건)
 *
 * 추출 대상:
 *   1) 한국 인명: 성씨 사전(`SURNAMES`) + 2~3자 이름 패턴 (총 2~4자)
 *   2) 영문 고유명사: [A-Z][a-zA-Z]{2,}
 *   3) 숫자 신호: 스코어("5-0"), 회차("3차"), 연도("2026년"), 연령("28세"), 점수
 *   4) 화이트리스트 조직/팀/지명 (확장 가능)
 *
 * 비-엔터티 (제외):
 *   - 일반명사("축구","경제","정부","경기","발표","대통령")
 *   - 동작어/접속어(topicLabeler STOP_WORDS와 부분 공유)
 *
 * 출력: lowercased Set<string>. 빈 Set 가능 (인용/추상 제목).
 */

/** 상위 한국 성씨 (인구 기준 ~95% 커버) */
const SURNAMES = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
  '한', '오', '서', '신', '권', '황', '안', '송', '류', '전',
  '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남',
  '심', '노', '하', '곽', '성', '차', '주', '우', '구', '나',
  '민', '진', '지', '엄', '원', '천', '방', '공', '현', '함',
];

/** 고유 인명/별명 — 성씨 패턴으로 못 잡는 케이스 (외국인, 활동명, 단음절) */
const KNOWN_PERSONS = new Set([
  '트럼프', '바이든', '푸틴', '시진핑', '아베', '기시다', '이시바',
  '머스크', '저커버그', '베이조스',
  '메시', '호날두', '음바페', '손흥민', '이강인', '김민재', '황선홍',
  '이재명', '윤석열', '한동훈', '조국', '이낙연',
  '블랙핑크', 'bts', '뉴진스', '아이브', '에스파',
]);

/** 알려진 조직/팀/지명/브랜드 (대표 케이스만 — IDF로 거를 수 없는 broad-but-specific) */
const KNOWN_ORGS = new Set([
  // 대기업/브랜드
  '삼성전자', '삼성', 'sk하이닉스', 'sk텔레콤', 'skt', 'lg전자', 'lg화학', 'lg에너지솔루션',
  '현대차', '현대자동차', '기아', '기아차', '포스코', '한화', '롯데', '신세계', '두산', '한진', 'cj',
  '카카오', '네이버', '쿠팡', '배민', '배달의민족', '토스', '당근', '엔씨', '넥슨', '크래프톤',
  '대한항공', '아시아나', '진에어', '제주항공', '티웨이',
  'byd', '테슬라', '체리', '체리자동차', '지커', '샤오펑', '비야디',
  '애플', '구글', '마이크로소프트', '메타', '아마존', '오픈ai', 'openai', '엔비디아',
  // 언론/방송
  'kbs', 'mbc', 'sbs', 'jtbc', 'ytn', 'mbn', 'tvn', 'tv조선', '채널a', 'ebs', 'tbs',
  '조선일보', '중앙일보', '동아일보', '한겨레', '경향신문', '한국일보', '연합뉴스', '뉴시스',
  // 스포츠 팀/리그 (국내)
  '두산베어스', 'lg트윈스', '삼성라이온즈', '한화이글스', '키움히어로즈', 'kt위즈', 'ssg랜더스',
  'kia타이거즈', '롯데자이언츠', 'nc다이노스',
  // 공공기관/랜드마크
  '국민의힘', '민주당', '조국혁신당', '정의당', '개혁신당',
  '청와대', '용산', '국회', '대법원', '검찰청', '경찰청', '국정원', '금감원', '공정위',
  '기재부', '외교부', '통일부', '법무부', '국방부', '행안부', '문체부', '복지부', '환경부',
  '한은', '한국은행', '금융위', '방통위', '국토부', '산업부', '교육부', '여가부',
  '오월드', '에버랜드', '롯데월드', '서울대공원',
  // 국가/지역
  '미국', '중국', '일본', '러시아', '북한', '대만', '우크라이나', '이스라엘', '이란',
  '프랑스', '독일', '영국', '이탈리아', '스페인', '튀르키예', '인도', '파키스탄', '베트남',
  '서울', '부산', '인천', '대구', '광주', '대전', '울산', '세종', '제주',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남',
  // 축구 클럽
  '뮌헨', '바이에른', '바르샤', '레알', '맨유', '맨시티', '리버풀', '첼시', '아스널',
  '토트넘', '파리', 'psg', '유벤투스', '인터밀란', 'ac밀란', '도르트문트', '나폴리',
]);

/** 일반명사/동작어 — entity로 취급 안 함 */
const ENTITY_STOPWORDS = new Set([
  // 일반 명사
  '축구', '야구', '농구', '배구', '경기', '경제', '정부', '대통령', '국가',
  '한국', '국내', '국제', '세계', '오늘', '내일', '어제', '지난', '최근',
  '뉴스', '속보', '단독', '인터뷰', '발표', '보도', '논평', '분석',
  '문제', '상황', '결과', '예정', '계획', '관련', '사건', '사고',
  '국민', '시민', '주민', '학생', '회사', '기업', '시장', '업체',
  // 동작/상태 (issueAggregator ACTION_ONLY_STOPWORDS와 일부 중복)
  '논의', '결정', '전망', '우려', '지적', '요구', '비판', '입장',
  '방안', '대책', '주장', '의혹', '혐의', '논란', '합의', '가능',
  // 약어/단위
  '명', '개', '건', '회', '시', '분', '초',
]);

/** 한국어 조사 — 토큰 끝에서 제거 */
const PARTICLES = [
  '으로는', '에서는', '에서도', '으로', '에서', '에게', '한테', '까지', '부터',
  '이라며', '이라고', '이라는', '라며', '라고', '라는',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '도',
];

function stripParticles(token: string): string {
  for (const p of PARTICLES) {
    if (token.length > p.length + 1 && token.endsWith(p)) {
      return token.slice(0, -p.length);
    }
  }
  return token;
}

/** 한글 토큰이 인명 패턴인지: 성씨 + 1~3자 (총 2~4자) */
function looksLikeKoreanName(token: string): boolean {
  if (token.length < 2 || token.length > 4) return false;
  if (!/^[가-힣]+$/.test(token)) return false;
  const surname = token[0];
  if (!SURNAMES.includes(surname)) return false;
  // 흔한 false positive 차단 (성씨 + 일반명사 조합)
  if (ENTITY_STOPWORDS.has(token)) return false;
  return true;
}

/**
 * 제목에서 엔터티 토큰 추출.
 * 출력은 lowercased + 정규화된 Set. 동일 엔터티의 다른 표기는 같은 토큰으로 매핑되지 않음(최소 구현).
 */
export function extractEntities(title: string): Set<string> {
  const entities = new Set<string>();
  if (!title) return entities;

  // 1) 따옴표/괄호/말줄임표 제거 + 특수문자 → 공백
  const cleaned = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/["'""''「」『』《》()()]/g, ' ')
    .replace(/\.{2,}|…/g, ' ');

  // 2) 영문 고유명사 (대문자 시작 4자 이상 — Tim 같은 짧은 외래어 제외)
  for (const m of cleaned.matchAll(/\b[A-Z][a-zA-Z]{3,}\b/g)) {
    entities.add(m[0].toLowerCase());
  }

  // 3) 숫자 신호 — 스코어/회차/연도/연령 (\b는 한글에 안 먹어서 직접 처리)
  for (const m of cleaned.matchAll(/(?<![\d])\d+[-:]\d+(?![\d])/g)) entities.add(m[0]);
  for (const m of cleaned.matchAll(/\d+(차|년|세|위|회|기|호|연패|연승|연속)/g)) {
    entities.add(m[0]);
  }

  // 4) 한글 토큰 추출 + 조사 제거 후 인명/조직 매칭
  const lowered = cleaned.toLowerCase();
  for (const raw of lowered.split(/[^가-힣a-z0-9]+/)) {
    if (!raw) continue;
    const stripped = stripParticles(raw);
    if (stripped.length < 2) continue;
    if (ENTITY_STOPWORDS.has(stripped)) continue;

    if (KNOWN_PERSONS.has(stripped)) {
      entities.add(stripped);
      continue;
    }
    if (KNOWN_ORGS.has(stripped)) {
      entities.add(stripped);
      continue;
    }
    if (looksLikeKoreanName(stripped)) {
      entities.add(stripped);
      continue;
    }
  }

  return entities;
}

/** 두 entity Set의 교집합 크기 */
export function entityIntersection(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let count = 0;
  for (const e of a) if (b.has(e)) count++;
  return count;
}

export const __internal__ = {
  SURNAMES,
  KNOWN_PERSONS,
  KNOWN_ORGS,
  ENTITY_STOPWORDS,
  looksLikeKoreanName,
  stripParticles,
};
