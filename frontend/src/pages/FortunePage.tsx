import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MetaHead } from '../components/shared/MetaHead';
import fortuneData from '../data/fortune-templates.json';
import tarotCards from '../data/tarot-cards-ko.json';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// ─── Hash util ───

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickByHash<T>(arr: readonly T[], seed: string): T {
  return arr[simpleHash(seed) % arr.length];
}

// ─── Types ───

type FortuneTab = 'fortune' | 'tarot';

interface TarotCard {
  id: number;
  name: string;
  nameEn: string;
  emoji: string;
  meaning: string;
  reversed: string;
  advice: string;
  newsTemplate: string;
}

interface TrendingPost {
  id: number;
  title: string;
  url: string;
  source_key: string;
}

// ─── Daily Fortune ───

function useDailyFortune(birthDate: string) {
  return useMemo(() => {
    if (!birthDate) return null;
    const today = new Date().toISOString().slice(0, 10);
    const seed = `${birthDate}:${today}`;

    const general = pickByHash(fortuneData.general, seed + ':general');
    const love = pickByHash(fortuneData.love, seed + ':love');
    const money = pickByHash(fortuneData.money, seed + ':money');
    const health = pickByHash(fortuneData.health, seed + ':health');
    const advice = pickByHash(fortuneData.advice, seed + ':advice');
    const luckyColor = pickByHash(fortuneData.luckyColors, seed + ':color');
    const luckyItem = pickByHash(fortuneData.luckyItems, seed + ':item');
    const luckyNumber = (simpleHash(seed + ':number') % 45) + 1;

    return { general, love, money, health, advice, luckyColor, luckyItem, luckyNumber };
  }, [birthDate]);
}

const BIRTH_KEY = 'weeklit:fortune:birth';

function DailyFortune() {
  const [birthDate, setBirthDate] = useState(() => {
    try { return localStorage.getItem(BIRTH_KEY) ?? ''; } catch { return ''; }
  });
  const [input, setInput] = useState(birthDate);
  const fortune = useDailyFortune(birthDate);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    setBirthDate(input);
    try { localStorage.setItem(BIRTH_KEY, input); } catch { /* ignore */ }
  }, [input]);

  if (!birthDate || !fortune) {
    return (
      <form onSubmit={handleSubmit} className="text-center py-12">
        <div className="text-6xl mb-4">🔮</div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">오늘의 운세</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">생년월일을 입력하면 오늘의 운세를 확인할 수 있어요</p>
        <input
          type="date"
          value={input}
          onChange={e => setInput(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white mb-4 text-center"
          required
        />
        <br />
        <button
          type="submit"
          className="mt-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
        >
          운세 보기
        </button>
      </form>
    );
  }

  const categories = [
    { icon: '🌟', label: '종합운', text: fortune.general },
    { icon: '💕', label: '애정운', text: fortune.love },
    { icon: '💰', label: '재물운', text: fortune.money },
    { icon: '💪', label: '건강운', text: fortune.health },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          🔮 오늘의 운세
        </h2>
        <button
          onClick={() => { setBirthDate(''); setInput(''); try { localStorage.removeItem(BIRTH_KEY); } catch { /* ignore */ } }}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          초기화
        </button>
      </div>

      {categories.map(({ icon, label, text }) => (
        <div key={label} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
            {icon} {label}
          </div>
          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{text}</p>
        </div>
      ))}

      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <div className="text-slate-500 dark:text-slate-400">행운의 숫자</div>
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{fortune.luckyNumber}</div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">행운의 색</div>
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{fortune.luckyColor}</div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">행운의 아이템</div>
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{fortune.luckyItem}</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
        <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">오늘의 한마디</p>
        <p className="text-slate-700 dark:text-slate-200 font-medium italic">"{fortune.advice}"</p>
      </div>
    </div>
  );
}

// ─── News Tarot ───

function useTrendingPosts() {
  return useQuery<TrendingPost[]>({
    queryKey: ['trending-for-tarot'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/posts?limit=10&category=trend`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.posts ?? data ?? [];
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

type TarotPhase = 'select' | 'flipping' | 'revealed';

function NewsTarot() {
  const { data: trendingPosts } = useTrendingPosts();
  const [phase, setPhase] = useState<TarotPhase>('select');
  const [selectedCard, setSelectedCard] = useState<TarotCard | null>(null);
  const [isReversed, setIsReversed] = useState(false);
  const [shuffledCards, setShuffledCards] = useState<TarotCard[]>(() => {
    const cards = [...tarotCards] as TarotCard[];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  });

  const handleSelect = useCallback((card: TarotCard) => {
    const reversed = Math.random() < 0.3; // 30% 역방향
    setSelectedCard(card);
    setIsReversed(reversed);
    setPhase('flipping');
    setTimeout(() => setPhase('revealed'), 800);
  }, []);

  const handleReset = useCallback(() => {
    setPhase('select');
    setSelectedCard(null);
    setIsReversed(false);
    const cards = [...tarotCards] as TarotCard[];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    setShuffledCards(cards);
  }, []);

  // Get a trending topic for the card message
  const trendingTopic = useMemo(() => {
    if (!trendingPosts?.length || !selectedCard) return '오늘의 핫이슈';
    const post = trendingPosts[selectedCard.id % trendingPosts.length];
    // Extract clean topic from title (remove ranking prefixes like "🔺 1위 ")
    return post.title.replace(/^[🔺🔻🆕📊]\s*\d+위\s*/u, '').replace(/\s*\(\d[\d,]*회\)$/u, '').trim() || '오늘의 핫이슈';
  }, [trendingPosts, selectedCard]);

  if (phase === 'select') {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center justify-center gap-2">
            🃏 뉴스 타로
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">카드를 한 장 선택하세요</p>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {shuffledCards.map((card) => (
            <button
              key={card.id}
              onClick={() => handleSelect(card)}
              className="aspect-[2/3] bg-gradient-to-br from-indigo-600 to-purple-700 rounded-lg border-2 border-indigo-400/30 hover:border-yellow-400 hover:scale-105 transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg"
              aria-label={`타로 카드 선택`}
            >
              <span className="text-2xl opacity-60">✦</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedCard) return null;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center justify-center gap-2">
          🃏 뉴스 타로
        </h2>
      </div>

      {/* Card with flip animation */}
      <div className="flex justify-center">
        <div
          className="w-48 aspect-[2/3] relative"
          style={{ perspective: '1000px' }}
        >
          <div
            className={`w-full h-full transition-transform duration-700 relative`}
            style={{
              transformStyle: 'preserve-3d',
              transform: phase === 'flipping' || phase === 'revealed' ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Back */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl border-2 border-indigo-400/30 flex items-center justify-center shadow-lg"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <span className="text-4xl opacity-60">✦</span>
            </div>
            {/* Front */}
            <div
              className={`absolute inset-0 bg-white dark:bg-slate-800 rounded-xl border-2 border-purple-300 dark:border-purple-600 flex flex-col items-center justify-center p-4 shadow-lg ${isReversed ? 'rotate-180' : ''}`}
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <span className="text-5xl mb-2">{selectedCard.emoji}</span>
              <div className="text-lg font-bold text-slate-800 dark:text-white">{selectedCard.name}</div>
              <div className="text-xs text-slate-400">{selectedCard.nameEn}</div>
              {isReversed && (
                <span className="mt-1 text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                  역방향
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Interpretation */}
      {phase === 'revealed' && (
        <div className="space-y-3 animate-in fade-in duration-500">
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
            <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">카드의 의미</div>
            <p className="text-slate-600 dark:text-slate-300 text-sm">
              {isReversed ? selectedCard.reversed : selectedCard.meaning}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
              📰 오늘의 트렌드와 함께
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              {selectedCard.newsTemplate.replace('{topic}', `"${trendingTopic}"`)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">타로의 조언</p>
            <p className="text-slate-700 dark:text-slate-200 font-medium italic">"{selectedCard.advice}"</p>
          </div>

          <button
            onClick={handleReset}
            className="w-full py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            다시 뽑기
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───

export function FortunePage() {
  const [tab, setTab] = useState<FortuneTab>('fortune');

  const tabs: { key: FortuneTab; label: string; icon: string }[] = [
    { key: 'fortune', label: '오늘의 운세', icon: '🔮' },
    { key: 'tarot', label: '뉴스 타로', icon: '🃏' },
  ];

  return (
    <div className="max-w-lg mx-auto">
      <MetaHead title="오늘의 운세" />
      {/* Tab bar */}
      <div className="flex gap-2 mb-6">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-purple-300'
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'fortune' && <DailyFortune />}
      {tab === 'tarot' && <NewsTarot />}
    </div>
  );
}
