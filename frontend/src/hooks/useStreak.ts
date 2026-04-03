import { useState, useEffect } from 'react';

interface StreakData {
  lastVisitDate: string;
  currentStreak: number;
  longestStreak: number;
}

const STORAGE_KEY = 'weeklit:streak';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function loadStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { lastVisitDate: '', currentStreak: 0, longestStreak: 0 };
}

function saveStreak(data: StreakData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function useStreak() {
  const [streak, setStreak] = useState<StreakData>(() => {
    const stored = loadStreak();
    const todayStr = today();

    // Already visited today
    if (stored.lastVisitDate === todayStr) return stored;

    // Visited yesterday → streak continues
    if (stored.lastVisitDate === yesterday()) {
      const updated: StreakData = {
        lastVisitDate: todayStr,
        currentStreak: stored.currentStreak + 1,
        longestStreak: Math.max(stored.longestStreak, stored.currentStreak + 1),
      };
      saveStreak(updated);
      return updated;
    }

    // Streak broken → reset to 1
    const reset: StreakData = {
      lastVisitDate: todayStr,
      currentStreak: 1,
      longestStreak: Math.max(stored.longestStreak, 1),
    };
    saveStreak(reset);
    return reset;
  });

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setStreak(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return streak;
}
