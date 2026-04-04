/** URL 패턴 기반 뉴스 서브카테고리 분류기 */

const URL_PATTERNS: readonly [RegExp, string][] = [
  [/\/(politics|정치|pol)\//i, '정치'],
  [/\/(economy|경제|econo|money|finance)\//i, '경제'],
  [/\/(society|사회|soc|national)\//i, '사회'],
  [/\/(international|world|global|세계|foreign)\//i, '세계'],
  [/\/(entertain|culture|연예|ent|celeb)\//i, '연예'],
  [/\/(sports?|스포츠)\//i, '스포츠'],
  [/\/(science|tech|it|digital|과학|ICT)\//i, 'IT/과학'],
  [/\/(life|living|health|생활|라이프|wellness)\//i, '생활'],
];

const SOURCE_DEFAULTS: Readonly<Record<string, string>> = {
  hankyung: '경제',
  mk: '경제',
};

export function classifyNewsSubcategory(url: string, sourceKey: string): string | null {
  for (const [pattern, subcategory] of URL_PATTERNS) {
    if (pattern.test(url)) return subcategory;
  }
  return SOURCE_DEFAULTS[sourceKey] ?? null;
}
