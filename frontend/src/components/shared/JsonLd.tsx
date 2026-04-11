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
    inLanguage: 'ko',
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
  readonly dateModified?: string;
  readonly description?: string;
  readonly image?: string;
  readonly url?: string;
  readonly sourceCount?: number;
}

export function ArticleJsonLd({
  headline,
  datePublished,
  dateModified,
  description,
  image,
  url,
  sourceCount,
}: ArticleJsonLdProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline,
    datePublished,
    ...(dateModified ? { dateModified } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(url ? { url } : {}),
    inLanguage: 'ko',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    ...(sourceCount && sourceCount > 1
      ? { speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', 'article > p'] } }
      : {}),
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

// ── CollectionPage JSON-LD (category pages) ──

interface CollectionPageJsonLdProps {
  readonly name: string;
  readonly description: string;
  readonly url: string;
}

export function CollectionPageJsonLd({ name, description, url }: CollectionPageJsonLdProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: `${SITE_URL}${url}`,
    inLanguage: 'ko',
    isPartOf: {
      '@type': 'WebSite',
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

// ── Dataset JSON-LD (trend data) ──

export function DatasetJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: '한국 실시간 인터넷 트렌드',
    description: '한국 주요 커뮤니티, 뉴스, YouTube 등 90개 이상 소스에서 10분마다 수집하는 실시간 트렌드 데이터',
    url: SITE_URL,
    license: 'https://weeklit.net/about',
    creator: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    temporalCoverage: '..',
    isAccessibleForFree: true,
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/rss+xml',
      contentUrl: `${SITE_URL}/api/feed/rss`,
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
