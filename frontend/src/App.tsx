import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './pages/HomePage';

const WeatherPage = lazy(() => import('./pages/WeatherPage').then(m => ({ default: m.WeatherPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const IssueDetailPage = lazy(() => import('./pages/IssueDetailPage').then(m => ({ default: m.IssueDetailPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const FortunePage = lazy(() => import('./pages/FortunePage').then(m => ({ default: m.FortunePage })));
const GamesHubPage = lazy(() => import('./pages/GamesHubPage').then(m => ({ default: m.GamesHubPage })));
const Game2048Page = lazy(() => import('./pages/Game2048Page').then(m => ({ default: m.Game2048Page })));
const MinesweeperPage = lazy(() => import('./pages/MinesweeperPage').then(m => ({ default: m.MinesweeperPage })));
const SnakePage = lazy(() => import('./pages/SnakePage').then(m => ({ default: m.SnakePage })));
const SudokuPage = lazy(() => import('./pages/SudokuPage').then(m => ({ default: m.SudokuPage })));
const TowerDefensePage = lazy(() => import('./pages/TowerDefensePage').then(m => ({ default: m.TowerDefensePage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,
      gcTime: 300_000,
    },
  },
});

function PageLoader() {
  return <div className="text-center py-20 text-slate-400 animate-pulse">로딩 중...</div>;
}

function MainRoutes() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || undefined;
  const searchQuery = params.get('q') ?? '';

  const handleCategoryChange = (cat: string | undefined) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (cat) { next.set('category', cat); } else { next.delete('category'); }
      return next;
    });
  };

  const handleSearchChange = (q: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (q) { next.set('q', q); } else { next.delete('q'); }
      return next;
    });
  };

  return (
    <Layout searchQuery={searchQuery} onSearchChange={handleSearchChange}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                category={category}
                onCategoryChange={handleCategoryChange}
                searchQuery={searchQuery}
              />
            }
          />
          <Route path="/entertainment" element={<Navigate to="/?category=movie" replace />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="/issue/:postId" element={<IssueDetailPage />} />
          <Route path="/fortune" element={<FortunePage />} />
          <Route path="/games" element={<GamesHubPage />} />
          <Route path="/games/2048" element={<Game2048Page />} />
          <Route path="/games/minesweeper" element={<MinesweeperPage />} />
          <Route path="/games/snake" element={<SnakePage />} />
          <Route path="/games/sudoku" element={<SudokuPage />} />
          <Route path="/games/tower-defense" element={<TowerDefensePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function AppRoutes() {
  const location = useLocation();
  if (location.pathname === '/admin' || location.pathname === '/admin/') {
    return <Suspense fallback={<PageLoader />}><AdminPage /></Suspense>;
  }
  return <MainRoutes />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
