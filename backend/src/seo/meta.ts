/**
 * SEO 메타 데이터 — 프론트 frontend/src/config/seoMeta.ts와 동기화.
 * 백엔드 botRenderer가 크롤러에게 반환할 HTML 생성 시 사용.
 *
 * ⚠️ 프론트 seoMeta.ts 변경 시 이 파일도 같이 업데이트 필요.
 */

export interface SeoMeta {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly intro: string;
  readonly keywords: readonly string[];
  readonly category?: string;
  readonly breadcrumbLabel?: string;
}

export const SEO_META: Record<string, SeoMeta> = {
  '/': {
    path: '/',
    title: '위클릿 — 실시간 이슈·커뮤니티 인기글 모아보기',
    description:
      '디시인사이드, 클리앙, 에펨코리아, 루리웹 등 한국 주요 커뮤니티와 뉴스·유튜브 실시간 이슈를 10분마다 모아봅니다.',
    h1: '한국 인터넷 실시간 트렌드',
    intro:
      '위클릿은 국내 커뮤니티·뉴스·유튜브·포털의 인기글을 10분마다 수집해 실시간 이슈를 한 화면에서 보여줍니다.',
    keywords: ['실시간 이슈', '커뮤니티 모음', '오늘의 이슈', '한국 인터넷 트렌드', '인기글 모아보기'],
  },
  '/realtime': {
    path: '/realtime',
    title: '실시간 이슈 — 오늘의 이슈 모아보기',
    description:
      '빅카인즈 Top10, 주요 커뮤니티, 뉴스에서 오늘 가장 뜨거운 실시간 이슈를 한눈에. 10분 주기 자동 갱신.',
    h1: '오늘의 실시간 이슈',
    intro:
      '빅카인즈 Top10과 주요 커뮤니티·뉴스에서 수집한 오늘의 실시간 이슈를 순위별로 정리합니다. 네이버 실시간 검색어 폐지 이후의 대안.',
    keywords: ['실시간 이슈', '오늘의 이슈', '실시간 검색어', '네이버 실검 대안', '빅카인즈 오늘의 이슈'],
    breadcrumbLabel: '실시간 이슈',
  },
  '/community': {
    path: '/community',
    title: '커뮤니티 인기글 모음 — 디시·클리앙·에펨코·루리웹 실시간',
    description:
      '디시인사이드, 클리앙, 에펨코리아, 루리웹, 뽐뿌, 보배드림 등 한국 주요 커뮤니티 인기글을 10분마다 모아봅니다.',
    h1: '실시간 커뮤니티 인기글 모음',
    intro:
      '디시인사이드, 클리앙, 에펨코리아, 루리웹, 뽐뿌 등 국내 30여 개 주요 커뮤니티의 실시간 인기글을 한 화면에서 확인할 수 있습니다.',
    keywords: [
      '커뮤니티 인기글',
      '커뮤니티 모음',
      '디시인사이드 실시간',
      '클리앙 인기글',
      '에펨코리아 베스트',
      '루리웹 베스트',
      '뽐뿌 인기',
      '한국 커뮤니티 모아보기',
    ],
    category: 'community',
    breadcrumbLabel: '커뮤니티',
  },
  '/news': {
    path: '/news',
    title: '실시간 뉴스 이슈 — 주요 언론사 속보 모아보기',
    description:
      '연합뉴스, 한겨레, 조선일보, 중앙일보 등 주요 언론사 속보와 IT·테크 뉴스레터를 10분마다 모아봅니다.',
    h1: '실시간 뉴스 이슈 모아보기',
    intro:
      '국내 주요 언론사 속보와 IT·테크 뉴스레터를 10분마다 수집해 실시간 뉴스 이슈를 한 화면에 모읍니다.',
    keywords: ['실시간 뉴스', '뉴스 속보', '뉴스 모아보기', '실시간 뉴스 이슈', '한국 뉴스 트렌드'],
    category: 'news,newsletter,tech',
    breadcrumbLabel: '뉴스',
  },
  '/video': {
    path: '/video',
    title: '유튜브 인기 급상승 모아보기 — 실시간 인기 동영상',
    description:
      '유튜브 인기 급상승 동영상과 주요 채널의 실시간 인기 콘텐츠를 10분마다 모아봅니다.',
    h1: '유튜브 인기 급상승 모아보기',
    intro:
      '유튜브 인기 급상승 동영상과 주요 채널의 실시간 인기 콘텐츠를 한 화면에서 확인할 수 있습니다.',
    keywords: ['유튜브 인기 급상승', '유튜브 인기 동영상', '유튜브 트렌드', 'YouTube 모아보기'],
    category: 'video',
    breadcrumbLabel: '유튜브',
  },
  '/portal': {
    path: '/portal',
    title: '네이트·줌 포털 인기뉴스 — 실시간 이슈',
    description:
      '네이트·줌 등 포털 인기뉴스와 판·톡톡 인기글을 실시간으로 모아봅니다.',
    h1: '포털 인기뉴스 모아보기',
    intro:
      '네이트·줌 등 포털의 인기뉴스와 커뮤니티 인기글을 10분마다 수집합니다.',
    keywords: ['네이트 판', '네이트 실시간', '줌 인기뉴스', '포털 이슈', '네이트 인기글'],
    category: 'portal',
    breadcrumbLabel: '포털',
  },
  '/deals': {
    path: '/deals',
    title: '핫딜 모아보기 — 실시간 쇼핑 특가 정보',
    description:
      '뽐뿌, 루리웹, 퀘이사존 등 주요 핫딜 커뮤니티의 특가·세일 정보를 실시간으로 모아봅니다.',
    h1: '실시간 핫딜 모아보기',
    intro:
      '뽐뿌, 루리웹, 퀘이사존 등 주요 핫딜 커뮤니티에서 올라오는 특가·세일 정보를 10분마다 수집합니다.',
    keywords: ['핫딜', '핫딜 모음', '뽐뿌 핫딜', '루리웹 핫딜', '실시간 할인'],
    category: 'deals',
    breadcrumbLabel: '핫딜',
  },
  '/entertainment': {
    path: '/entertainment',
    title: '엔터테인먼트 랭킹 — 영화·음악·공연·도서·OTT·웹툰 실시간',
    description:
      '영화 박스오피스, 멜론 차트, 공연 예매 순위, 교보문고 베스트셀러, 넷플릭스 TOP, 네이버 웹툰 랭킹을 한 화면에.',
    h1: '엔터테인먼트 실시간 랭킹',
    intro:
      '영화 박스오피스, 멜론 TOP100, 공연 예매 순위, 교보문고 베스트셀러, 넷플릭스·웨이브 OTT 랭킹, 네이버 웹툰 인기작을 한 화면에서 확인하세요.',
    keywords: [
      '박스오피스',
      '멜론 차트',
      '공연 순위',
      '교보문고 베스트셀러',
      '넷플릭스 순위',
      '네이버 웹툰 랭킹',
      '엔터테인먼트 랭킹',
    ],
    category: 'entertainment',
    breadcrumbLabel: '엔터테인먼트',
  },
};

export function getSeoMeta(pathname: string): SeoMeta {
  return SEO_META[pathname] ?? SEO_META['/'];
}
