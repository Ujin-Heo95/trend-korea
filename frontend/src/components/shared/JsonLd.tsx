import { Helmet } from 'react-helmet-async';

const SITE_NAME = '위클릿';
const SITE_URL = 'https://weeklit.net';

// ── WebSite JSON-LD (homepage) ──

export function WebSiteJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      '한국 주요 커뮤니티, 뉴스, YouTube에서 실시간 이슈를 모아보는 트렌드 어그리게이터',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

// ── NewsArticle JSON-LD (issue detail) ──

interface ArticleJsonLdProps {
  readonly headline: string;
  readonly datePublished: string;
  readonly description?: string;
  readonly image?: string;
  readonly url?: string;
}

export function ArticleJsonLd({
  headline,
  datePublished,
  description,
  image,
  url,
}: ArticleJsonLdProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline,
    datePublished,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(url ? { url } : {}),
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

// ── BreadcrumbList JSON-LD ──

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

interface BreadcrumbJsonLdProps {
  readonly items: readonly BreadcrumbItem[];
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
