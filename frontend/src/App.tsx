import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './pages/HomePage';
import { PATH_TO_CATEGORY, categoryToPath } from './config/seoMeta';

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

/**
 * 레거시 쿼리 URL(?category=community)로 진입 시 신규 path(/community)로
 * 클라이언트 리다이렉트. 서버 측 301은 Cloudflare Pages _redirects에서 처리.
 */
function useLegacyCategoryRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    if (location.pathname !== '/') return;
    const legacyCategory = params.get('category');
    if (!legacyCategory) return;
    const targetPath = categoryToPath(legacyCategory);
    if (targetPath === '/') return;
    const remaining = new URLSearchParams(params);
    remaining.delete('category');
    const search = remaining.toString();
    navigate({ pathname: targetPath, search: search ? `?${search}` : '' }, { replace: true });
  }, [location.pathname, params, navigate]);
}

interface HomeRouteProps {
  readonly path: string;
}

function HomeRoute({ path }: HomeRouteProps) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const category = PATH_TO_CATEGORY[path];
  const searchQuery = params.get('q') ?? '';

  const handleCategoryChange = (cat: string | undefined) => {
    const targetPath = cat ? categoryToPath(cat) : '/';
    const search = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
    navigate({ pathname: targetPath, search }, { replace: false });
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
      <HomePage
        path={path}
        category={category}
        onCategoryChange={handleCategoryChange}
        searchQuery={searchQuery}
      />
    </Layout>
  );
}

function MainRoutes() {
  useLegacyCategoryRedirect();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomeRoute path="/" />} />
        <Route path="/realtime" element={<HomeRoute path="/realtime" />} />
        <Route path="/community" element={<HomeRoute path="/community" />} />
        <Route path="/news" element={<HomeRoute path="/news" />} />
        <Route path="/video" element={<HomeRoute path="/video" />} />
        <Route path="/portal" element={<HomeRoute path="/portal" />} />
        <Route path="/deals" element={<HomeRoute path="/deals" />} />
        <Route path="/entertainment" element={<HomeRoute path="/entertainment" />} />
        <Route path="/entertainment/movie" element={<Navigate to="/entertainment" replace />} />
        <Route path="/weather" element={<LayoutWrapper><WeatherPage /></LayoutWrapper>} />
        <Route path="/issue/:postId" element={<LayoutWrapper><IssueDetailPage /></LayoutWrapper>} />
        <Route path="/fortune" element={<LayoutWrapper><FortunePage /></LayoutWrapper>} />
        <Route path="/games" element={<LayoutWrapper><GamesHubPage /></LayoutWrapper>} />
        <Route path="/games/2048" element={<LayoutWrapper><Game2048Page /></LayoutWrapper>} />
        <Route path="/games/minesweeper" element={<LayoutWrapper><MinesweeperPage /></LayoutWrapper>} />
        <Route path="/games/snake" element={<LayoutWrapper><SnakePage /></LayoutWrapper>} />
        <Route path="/games/sudoku" element={<LayoutWrapper><SudokuPage /></LayoutWrapper>} />
        <Route path="/games/tower-defense" element={<LayoutWrapper><TowerDefensePage /></LayoutWrapper>} />
        <Route path="/about" element={<LayoutWrapper><AboutPage /></LayoutWrapper>} />
        <Route path="/privacy" element={<LayoutWrapper><PrivacyPage /></LayoutWrapper>} />
      </Routes>
    </Suspense>
  );
}

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useSearchParams();
  const searchQuery = params.get('q') ?? '';
  const handleSearchChange = (q: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (q) { next.set('q', q); } else { next.delete('q'); }
      return next;
    });
  };
  return (
    <Layout searchQuery={searchQuery} onSearchChange={handleSearchChange}>
      {children}
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
