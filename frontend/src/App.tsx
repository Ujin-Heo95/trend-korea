import React from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './pages/HomePage';
import type { Category } from './types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,
    },
  },
});

function AppRoutes() {
  const [params, setParams] = useSearchParams();
  const category = (params.get('category') as Category) || undefined;
  const searchQuery = params.get('q') ?? '';

  const handleCategoryChange = (cat: Category | undefined) => {
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
