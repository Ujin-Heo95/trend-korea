import { Helmet } from 'react-helmet-async';

const DEFAULT_DESCRIPTION =
  '위클릿은 한국 주요 커뮤니티, 뉴스, YouTube에서 실시간 이슈를 모아보는 트렌드 어그리게이터입니다';
const TITLE_SUFFIX = ' | 위클릿';
const DEFAULT_OG_IMAGE = 'https://weeklit.net/og-default.png';
const SITE_URL = 'https://weeklit.net';

interface MetaHeadProps {
  readonly title: string;
  readonly description?: string;
  readonly ogImage?: string;
  readonly url?: string;
  readonly type?: string;
}

export function MetaHead({
  title,
  description = DEFAULT_DESCRIPTION,
  ogImage = DEFAULT_OG_IMAGE,
  url = SITE_URL,
  type = 'website',
}: MetaHeadProps) {
  const fullTitle = `${title}${TITLE_SUFFIX}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:locale" content="ko_KR" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
