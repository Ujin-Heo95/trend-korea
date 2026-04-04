import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { Post } from '../types';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [k: string]: unknown }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

// Mock useTrending hook
const mockUseTrending = vi.fn();
vi.mock('../hooks/usePosts', () => ({
  useTrending: () => mockUseTrending(),
}));

import { TrendingSection } from '../components/TrendingSection';

const makePost = (id: number, title: string): Post => ({
  id,
  source_key: 'dcinside',
  source_name: 'DC인사이드',
  title,
  url: `https://example.com/post/${id}`,
  view_count: 1000 * id,
  comment_count: 10,
  like_count: 5,
  vote_count: 0,
  scraped_at: new Date().toISOString(),
  category: 'community',
});

describe('TrendingSection', () => {
  it('renders loading skeleton when isLoading is true', () => {
    mockUseTrending.mockReturnValue({ data: undefined, isLoading: true });
    render(<TrendingSection />);

    expect(screen.getByText(/지금 뜨는 글/)).toBeInTheDocument();
  });

  it('renders nothing when there are no posts', () => {
    mockUseTrending.mockReturnValue({ data: { posts: [] }, isLoading: false });
    const { container } = render(<TrendingSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders trending posts with rank numbers', () => {
    const posts = [
      makePost(1, '첫 번째 인기글'),
      makePost(2, '두 번째 인기글'),
      makePost(3, '세 번째 인기글'),
    ];
    mockUseTrending.mockReturnValue({ data: { posts }, isLoading: false });
    render(<TrendingSection />);

    expect(screen.getByText('첫 번째 인기글')).toBeInTheDocument();
    expect(screen.getByText('두 번째 인기글')).toBeInTheDocument();
    expect(screen.getByText('세 번째 인기글')).toBeInTheDocument();

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('renders source badges for each post', () => {
    const posts = [makePost(1, '테스트글')];
    mockUseTrending.mockReturnValue({ data: { posts }, isLoading: false });
    render(<TrendingSection />);

    expect(screen.getByText('DC인사이드')).toBeInTheDocument();
  });

  it('renders view count when available', () => {
    const posts = [makePost(1, '조회수 테스트')];
    mockUseTrending.mockReturnValue({ data: { posts }, isLoading: false });
    render(<TrendingSection />);

    expect(screen.getByText(/조회 1,000/)).toBeInTheDocument();
  });

  it('does not render view count when zero', () => {
    const posts = [{ ...makePost(1, '조회수 없음'), view_count: 0 }];
    mockUseTrending.mockReturnValue({ data: { posts }, isLoading: false });
    render(<TrendingSection />);

    expect(screen.queryByText(/조회 \d/)).not.toBeInTheDocument();
  });

  it('links each post to its issue detail page', () => {
    const posts = [makePost(42, '링크 테스트')];
    mockUseTrending.mockReturnValue({ data: { posts }, isLoading: false });
    render(<TrendingSection />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/issue/42');
  });

  it('limits to 10 posts maximum', () => {
    const posts = Array.from({ length: 15 }, (_, i) => makePost(i + 1, `게시글 ${i + 1}`));
    mockUseTrending.mockReturnValue({ data: { posts }, isLoading: false });
    render(<TrendingSection />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(10);
  });

  it('renders section heading', () => {
    const posts = [makePost(1, '제목')];
    mockUseTrending.mockReturnValue({ data: { posts }, isLoading: false });
    render(<TrendingSection />);

    expect(screen.getByText(/지금 뜨는 글/)).toBeInTheDocument();
  });
});
