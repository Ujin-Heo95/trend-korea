import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import type { Category } from './types';

const queryClient = new QueryClient();

export default function App() {
  const [category, setCategory] = useState<Category | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout searchQuery={searchQuery} onSearchChange={handleSearchChange}>
          <Routes>
            <Route
              path="/"
              element={
                <HomePage
                  category={category}
                  onCategoryChange={setCategory}
                  searchQuery={searchQuery}
                />
              }
            />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
