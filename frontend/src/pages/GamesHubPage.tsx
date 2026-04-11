import React from 'react';
import { Link } from 'react-router-dom';
import { GAMES } from '../data/gamesSEO';
import { MetaHead } from '../components/shared/MetaHead';
import { BreadcrumbJsonLd } from '../components/shared/JsonLd';
import { Helmet } from 'react-helmet-async';
import { useGameScore } from '../hooks/useGameScore';

const SITE_URL = 'https://weeklit.net';

const GENRE_ICON: Record<string, string> = {
  '퍼즐': '🧩',
  '아케이드': '🕹️',
  '전략': '🏰',
};

function GameCard({ slug, title, description, genre }: {
  slug: string;
  title: string;
  description: string;
  genre: string;
}) {
  const { bestScore } = useGameScore(slug);

  return (
    <Link
      to={`/games/${slug}`}
      className="block p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl" role="img" aria-label={genre}>
          {GENRE_ICON[genre] ?? '🎮'}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
            {description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
              {genre}
            </span>
            {bestScore > 0 && (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                최고 {bestScore.toLocaleString()}점
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function GamesHubJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '무료 온라인 게임 모음',
    description: '2048, 지뢰찾기, 스네이크, 스도쿠, 타워디펜스를 브라우저에서 무료로 즐기세요.',
    url: `${SITE_URL}/games`,
    isPartOf: { '@type': 'WebSite', name: 'WeekLit', url: SITE_URL },
    hasPart: GAMES.map(g => ({
      '@type': 'VideoGame',
      name: g.title,
      url: `${SITE_URL}/games/${g.slug}`,
      gamePlatform: 'Web Browser',
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

export function GamesHubPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <MetaHead
        title="무료 온라인 게임 - 브라우저에서 즐기는 게임 모음 | WeekLit"
        description="2048, 지뢰찾기, 스네이크, 스도쿠, 타워디펜스를 설치 없이 브라우저에서 무료로 즐기세요."
        url={`${SITE_URL}/games`}
      />
      <BreadcrumbJsonLd
        items={[
          { label: '홈', href: '/' },
          { label: '게임' },
        ]}
      />
      <GamesHubJsonLd />

      {/* Breadcrumb */}
      <nav className="text-xs text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1">
        <Link to="/" className="hover:text-blue-500">홈</Link>
        <span>/</span>
        <span className="text-slate-600 dark:text-slate-300">게임</span>
      </nav>

      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
        무료 온라인 게임
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        설치 없이 브라우저에서 바로 즐기세요. 기록은 자동 저장됩니다.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {GAMES.map(game => (
          <GameCard
            key={game.slug}
            slug={game.slug}
            title={game.title}
            description={game.description}
            genre={game.genre}
          />
        ))}
      </div>

      {/* SEO text */}
      <section className="mt-10 text-sm text-slate-500 dark:text-slate-400 leading-relaxed space-y-3">
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300">
          WeekLit 게임 소개
        </h2>
        <p>
          WeekLit 게임은 설치 없이 웹 브라우저에서 즐길 수 있는 무료 온라인 게임 모음입니다.
          클래식 퍼즐 게임부터 전략 게임까지, 다양한 장르의 게임을 제공합니다.
          PC와 모바일 모두 지원하며, 최고 기록은 브라우저에 자동 저장됩니다.
        </p>
        <p>
          2048 숫자 퍼즐, 지뢰찾기, 스네이크 뱀 게임, 스도쿠 논리 퍼즐, 타워디펜스 전략 게임 등
          시간을 보내기 좋은 게임들을 한곳에서 즐겨보세요.
          모든 게임은 한국어를 지원하며, 광고 없이 쾌적하게 플레이할 수 있습니다.
        </p>
      </section>
    </div>
  );
}
