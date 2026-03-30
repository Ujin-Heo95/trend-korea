import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './pages/HomePage';
import { DailyReportPage } from './pages/DailyReportPage';
import { WeatherPage } from './pages/WeatherPage';
import { KeywordsPage } from './pages/KeywordsPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { fetchLatestReport } from './api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,
    },
  },
});

function DailyReportRedirect() {
  const { data: latest, isLoading } = useQuery({
    queryKey: ['daily-report-latest'],
    queryFn: fetchLatestReport,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return <div className="text-center py-20 text-slate-400">로딩 중...</div>;
  }

  if (latest?.report_date) {
    const dateOnly = String(latest.report_date).slice(0, 10);
    return <Navigate to={`/daily-report/${dateOnly}`} replace />;
  }

  return (
    <div className="text-center py-20 text-slate-500">
      아직 생성된 리포트가 없습니다.
    </div>
  );
}

function AppRoutes() {
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
        <Route path="/daily-report" element={<DailyReportRedirect />} />
        <Route path="/daily-report/:date" element={<DailyReportPage />} />
        <Route path="/entertainment" element={<Navigate to="/?category=movie" replace />} />
        <Route path="/keywords" element={<KeywordsPage />} />
        <Route path="/weather" element={<WeatherPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
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
