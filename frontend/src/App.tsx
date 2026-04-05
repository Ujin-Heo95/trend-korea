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
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const FortunePage = lazy(() => import('./pages/FortunePage').then(m => ({ default: m.FortunePage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,
    },
  },
});

function PageLoader() {
  return <div className="text-center py-20 text-slate-400 animate-pulse">로딩 중...</div>;
}

function AppRoutes() {
  const location = useLocation();
  if (location.pathname === '/admin') {
    return <Suspense fallback={<PageLoader />}><AdminPage /></Suspense>;
  }

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
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/fortune" element={<FortunePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </Suspense>
    </Layout>
  );
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
