import { useState, useCallback } from 'react';

const STORAGE_KEY = 'weeklit:game-scores';

interface GameScores {
  [gameId: string]: {
    best: number;
    lastPlayed: string; // ISO date
  };
}

function loadScores(): GameScores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GameScores) : {};
  } catch {
    return {};
  }
}

function saveScores(scores: GameScores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch { /* quota exceeded */ }
}

export function useGameScore(gameId: string) {
  const [scores, setScores] = useState(loadScores);

  const bestScore = scores[gameId]?.best ?? 0;

  const updateScore = useCallback(
    (score: number) => {
      setScores(prev => {
        const current = prev[gameId]?.best ?? 0;
        if (score <= current) return prev;
        const next: GameScores = {
          ...prev,
          [gameId]: { best: score, lastPlayed: new Date().toISOString() },
        };
        saveScores(next);
        return next;
      });
    },
    [gameId],
  );

  const resetScore = useCallback(() => {
    setScores(prev => {
      const { [gameId]: _, ...rest } = prev;
      saveScores(rest);
      return rest;
    });
  }, [gameId]);

  return { bestScore, updateScore, resetScore };
}
