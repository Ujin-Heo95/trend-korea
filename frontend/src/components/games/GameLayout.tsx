import React from 'react';
import { Link } from 'react-router-dom';
import { MetaHead } from '../shared/MetaHead';
import { BreadcrumbJsonLd } from '../shared/JsonLd';
import { ShareButton } from '../shared/ShareButton';
import { type GameSEOData, GAMES } from '../../data/gamesSEO';
import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://weeklit.net';

interface GameLayoutProps {
  readonly game: GameSEOData;
  readonly score?: number;
  readonly bestScore?: number;
  readonly children: React.ReactNode;
}

function GameJsonLd({ game }: { readonly game: GameSEOData }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': ['VideoGame', 'WebApplication'],
    name: game.title,
    description: game.description,
    url: `${SITE_URL}/games/${game.slug}`,
    applicationCategory: 'Game',
    gamePlatform: 'Web Browser',
    operatingSystem: 'Any',
    genre: game.genre,
    inLanguage: 'ko',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    browserRequirements: 'HTML5 지원 브라우저',
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

function FAQJsonLd({ faq }: { readonly faq: readonly { q: string; a: string }[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

export function GameLayout({ game, score, bestScore, children }: GameLayoutProps) {
  const gameUrl = `${SITE_URL}/games/${game.slug}`;
  const relatedGames = GAMES.filter(g => g.slug !== game.slug);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <MetaHead
        title={game.metaTitle}
        description={game.description}
        url={gameUrl}
      />
      <BreadcrumbJsonLd
        items={[
          { label: '홈', href: '/' },
          { label: '게임', href: '/games' },
          { label: game.title },
        ]}
      />
      <GameJsonLd game={game} />
      <FAQJsonLd faq={game.faq} />

      {/* Breadcrumb */}
      <nav className="text-xs text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1">
        <Link to="/" className="hover:text-blue-500">홈</Link>
        <span>/</span>
        <Link to="/games" className="hover:text-blue-500">게임</Link>
        <span>/</span>
        <span className="text-slate-600 dark:text-slate-300">{game.title}</span>
      </nav>

      {/* Title + Score */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {game.title}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          {score !== undefined && (
            <span className="text-slate-600 dark:text-slate-300">
              점수: <span className="font-bold text-blue-600 dark:text-blue-400">{score.toLocaleString()}</span>
            </span>
          )}
          {bestScore !== undefined && bestScore > 0 && (
            <span className="text-slate-400 dark:text-slate-500">
              최고: {bestScore.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Game Area */}
      <div className="mb-6">
        {children}
      </div>

      {/* Share */}
      <div className="flex items-center gap-2 mb-8">
        <span className="text-xs text-slate-400">공유:</span>
        <ShareButton
          url={gameUrl}
          title={`${game.title} - WeekLit Games${bestScore ? ` | 최고 ${bestScore.toLocaleString()}점` : ''}`}
          description={game.description}
        />
      </div>

      {/* SEO Content */}
      <div className="space-y-6 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {/* Ad spacer — 150px+ from game area */}
        <div className="h-[160px]" aria-hidden="true" />

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">
            플레이 방법
          </h2>
          <p>{game.howToPlay}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">
            게임 팁 & 전략
          </h2>
          <ul className="list-disc list-inside space-y-1">
            {game.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">
            게임 역사
          </h2>
          <p>{game.history}</p>
        </section>

        {/* Related Games */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
            다른 게임
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {relatedGames.map(g => (
              <Link
                key={g.slug}
                to={`/games/${g.slug}`}
                className="block p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors text-center"
              >
                <div className="text-lg mb-1">
                  {g.genre === '퍼즐' ? '🧩' : g.genre === '아케이드' ? '🕹️' : '🏰'}
                </div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{g.title}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
            자주 묻는 질문
          </h2>
          <div className="space-y-3">
            {game.faq.map(({ q, a }, i) => (
              <details key={i} className="group">
                <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600">
                  {q}
                </summary>
                <p className="mt-1 pl-4 text-slate-500 dark:text-slate-400">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
