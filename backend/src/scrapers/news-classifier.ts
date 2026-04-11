/** URL 패턴 + 소스 기본값 + 타이틀 키워드 기반 뉴스 서브카테고리 분류기 */

const URL_PATTERNS: readonly [RegExp, string][] = [
  [/\/(politics|정치|pol)\//i, '정치'],
  [/\/(economy|경제|econo|money|finance)\//i, '경제'],
  [/\/(society|사회|soc|national)\//i, '사회'],
  [/\/(international|world|global|세계|foreign)\//i, '세계'],
  [/\/(entertain|culture|연예|ent|celeb)\//i, '연예'],
  [/\/(sports?|스포츠)\//i, '스포츠'],
  [/\/(science|tech|it|digital|과학|ICT)\//i, 'IT/과학'],
  [/\/(life|living|health|생활|라이프|wellness)\//i, '생활'],
  // 추가 패턴
  [/\/(opinion|editorial|column|사설|칼럼)\//i, '정치'],
  [/\/(auto|car|부동산|real.?estate)\//i, '경제'],
];

const SOURCE_DEFAULTS: Readonly<Record<string, string>> = {
  hankyung: '경제',
  mk: '경제',
  asiae: '경제',
  etnews: 'IT/과학',
};

/** 타이틀 키워드 기반 폴백 분류 (URL 미매칭 시) */
const TITLE_KEYWORDS: readonly [RegExp, string][] = [
  [/주식|코스피|코스닥|환율|금리|증시|부동산|경제|GDP|무역|수출|수입|인플레/i, '경제'],
  [/대통령|국회|여당|야당|선거|정치|탄핵|국무회의|외교부/i, '정치'],
  [/사건|사고|재판|검찰|경찰|화재|지진|태풍|날씨|미세먼지/i, '사회'],
  [/미국|중국|일본|러시아|우크라|트럼프|바이든|NATO|유럽|북한/i, '세계'],
  [/야구|축구|농구|배구|올림픽|KBO|K리그|EPL|NBA|손흥민/i, '스포츠'],
  [/아이돌|드라마|영화|방송|연예|K-pop|콘서트|음악|넷플릭스/i, '연예'],
  [/AI|인공지능|반도체|스마트폰|앱|소프트웨어|5G|로봇|자율주행|사이버/i, 'IT/과학'],
  [/건강|다이어트|맛집|여행|패션|뷰티|육아|반려동물/i, '생활'],
];

function classifyByTitle(title: string): string | null {
  for (const [pattern, subcategory] of TITLE_KEYWORDS) {
    if (pattern.test(title)) return subcategory;
  }
  return null;
}

export function classifyNewsSubcategory(url: string, sourceKey: string, title?: string): string | null {
  // 1. URL 패턴 매칭 (가장 신뢰도 높음)
  for (const [pattern, subcategory] of URL_PATTERNS) {
    if (pattern.test(url)) return subcategory;
  }
  // 2. 소스 기본값 (단일 분야 매체)
  if (SOURCE_DEFAULTS[sourceKey]) return SOURCE_DEFAULTS[sourceKey];
  // 3. 타이틀 키워드 폴백 (URL 구조 없는 소스 대응)
  if (title) return classifyByTitle(title);
  return null;
}
