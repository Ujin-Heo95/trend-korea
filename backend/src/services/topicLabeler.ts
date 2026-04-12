/**
 * topicLabeler — 한 이슈 안에 묶인 포스트 제목들을 토픽 라벨로 클러스터링.
 *
 * 목적: 이슈 품질 평가 지표 `cross_topic_pairs_count` 산출.
 * 한 이슈 안에 토픽 라벨이 ≥3개로 갈라지면 cross-topic 의심 — 과병합 신호.
 *
 * 알고리즘 (LLM 호출 X, 결정적, 빠름):
 *   1) 각 제목을 한국어 토큰화 (조사 제거)
 *   2) 쌍별 word Jaccard 계산
 *   3) Jaccard ≥ JACCARD_THRESHOLD 에지로 union-find
 *   4) 결과: 각 제목이 어떤 라벨에 속하는지, 라벨 수, 가장 큰 라벨의 비율
 */

const JACCARD_THRESHOLD = 0.4;

/** 한국어 조사 — 긴 것부터 매칭 */
const PARTICLES = [
  '으로', '에서', '에게', '한테', '까지', '부터', '마다', '조차', '마저',
  '이나', '이라', '이라도', '이라면', '이지만',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만',
  '도', '나', '랑', '하고', '이며', '며', '며는', '여', '요', '죠',
];

/** STOP_WORDS — 의미 없는 일반어 */
const STOP_WORDS = new Set([
  '관련', '대한', '통해', '위해', '대해', '경우', '때문', '이번', '오늘',
  '최근', '지난', '있다', '없다', '하다', '되다', '및', '또는', '그리고',
  '하지만', '그러나', '따라서', '또한', '한편',
]);

function stripParticles(token: string): string {
  for (const p of PARTICLES) {
    if (token.length > p.length + 1 && token.endsWith(p)) {
      return token.slice(0, -p.length);
    }
  }
  return token;
}

export function tokenize(title: string): Set<string> {
  const cleaned = title
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]/g, ' ')
    .toLowerCase();
  const tokens = new Set<string>();
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue;
    const stripped = stripParticles(raw);
    if (stripped.length < 2) continue;
    if (STOP_WORDS.has(stripped)) continue;
    tokens.add(stripped);
  }
  return tokens;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface TopicLabelResult {
  /** 입력 제목 수 */
  readonly titleCount: number;
  /** 형성된 토픽 라벨 수 */
  readonly labelCount: number;
  /** 가장 큰 라벨이 차지하는 비율 [0,1] */
  readonly largestLabelRatio: number;
  /** label[i] = 라벨 ID (0..labelCount-1), titles와 동일 인덱스 */
  readonly labels: readonly number[];
  /** cross-topic 쌍 수 — 같은 이슈에 묶였지만 다른 라벨인 쌍의 수 */
  readonly crossTopicPairs: number;
}

/**
 * 제목 배열에 토픽 라벨 부여 (Union-Find).
 * 라벨이 1개면 응집, 3개 이상이면 cross-topic 의심.
 */
export function labelTopics(titles: readonly string[]): TopicLabelResult {
  const n = titles.length;
  if (n === 0) {
    return { titleCount: 0, labelCount: 0, largestLabelRatio: 0, labels: [], crossTopicPairs: 0 };
  }
  if (n === 1) {
    return { titleCount: 1, labelCount: 1, largestLabelRatio: 1, labels: [0], crossTopicPairs: 0 };
  }

  const tokenSets = titles.map(tokenize);
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number): void {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // 쌍별 비교 — n² (이슈당 보통 < 30 포스트라 충분히 빠름)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (jaccard(tokenSets[i], tokenSets[j]) >= JACCARD_THRESHOLD) {
        union(i, j);
      }
    }
  }

  // 라벨 ID를 0..labelCount-1로 정규화
  const rootToId = new Map<number, number>();
  const labels: number[] = [];
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let id = rootToId.get(root);
    if (id == null) {
      id = rootToId.size;
      rootToId.set(root, id);
    }
    labels.push(id);
  }
  const labelCount = rootToId.size;

  // 가장 큰 라벨 비율
  const labelSizes = new Array(labelCount).fill(0);
  for (const id of labels) labelSizes[id]++;
  const largestSize = Math.max(...labelSizes);
  const largestLabelRatio = largestSize / n;

  // cross-topic 쌍 수: 라벨이 다른 모든 (i, j) 쌍의 수
  let crossTopicPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (labels[i] !== labels[j]) crossTopicPairs++;
    }
  }

  return { titleCount: n, labelCount, largestLabelRatio, labels, crossTopicPairs };
}
