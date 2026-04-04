import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { Post } from '../types';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [k: string]: unknown }) =>
    React.createElement('a', { href: to, ...props }, children),
}));

// Mock shared components to keep tests focused
vi.mock('../components/shared/ShareButton', () => ({
  ShareButton: () => React.createElement('button', { 'data-testid': 'share-btn' }, 'Share'),
}));

vi.mock('../components/shared/VoteButton', () => ({
  VoteButton: () => React.createElement('button', { 'data-testid': 'vote-btn' }, 'Vote'),
}));

import { PostCard } from '../components/PostCard';

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: 1,
  source_key: 'dcinside',
  source_name: 'DC인사이드',
  title: '테스트 게시글 제목입니다',
  url: 'https://example.com/post/1',
  view_count: 12345,
  comment_count: 42,
  like_count: 100,
  vote_count: 5,
  scraped_at: new Date().toISOString(),
  category: 'community',
  ...overrides,
});

describe('PostCard', () => {
  it('renders the post title', () => {
    render(<PostCard post={makePost()} />);
    expect(screen.getByText('테스트 게시글 제목입니다')).toBeInTheDocument();
  });

  it('renders the source badge with source name', () => {
    render(<PostCard post={makePost()} />);
    expect(screen.getByText('DC인사이드')).toBeInTheDocument();
  });

  it('renders view count when greater than zero', () => {
    render(<PostCard post={makePost({ view_count: 12345 })} />);
    expect(screen.getByText(/조회/)).toHaveTextContent('조회 12,345');
  });

  it('renders comment count when greater than zero', () => {
    render(<PostCard post={makePost({ comment_count: 42 })} />);
    expect(screen.getByText(/댓글/)).toHaveTextContent('댓글 42');
  });

  it('renders like count when greater than zero', () => {
    render(<PostCard post={makePost({ like_count: 100 })} />);
    expect(screen.getByText(/추천/)).toHaveTextContent('추천 100');
  });

  it('does not render view count when zero', () => {
    render(<PostCard post={makePost({ view_count: 0 })} />);
    expect(screen.queryByText(/조회/)).not.toBeInTheDocument();
  });

  it('renders rank badge when rank is provided', () => {
    render(<PostCard post={makePost()} rank={1} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does not render rank badge when rank is not provided', () => {
    render(<PostCard post={makePost()} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('renders cluster expand button when cluster_size > 1', () => {
    render(<PostCard post={makePost({ cluster_size: 3 })} />);
    const button = screen.getByRole('button', { name: /외 2개 소스/ });
    expect(button).toBeInTheDocument();
  });

  it('does not render cluster button when cluster_size is 1', () => {
    render(<PostCard post={makePost({ cluster_size: 1 })} />);
    expect(screen.queryByRole('button', { name: /외.*소스/ })).not.toBeInTheDocument();
  });

  it('toggles cluster expansion on click', async () => {
    const user = userEvent.setup();
    const relatedSources = [
      { id: 2, source_name: '더쿠', source_key: 'theqoo', url: 'https://theqoo.net/1' },
    ];
    render(<PostCard post={makePost({ cluster_size: 2, related_sources: relatedSources })} />);

    const button = screen.getByRole('button', { name: /외 1개 소스/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('더쿠')).toBeInTheDocument();
  });

  it('links to the issue detail page', () => {
    render(<PostCard post={makePost({ id: 42 })} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/issue/42');
  });

  it('applies read styling when isRead is true', () => {
    const { container } = render(<PostCard post={makePost()} isRead={true} />);
    const card = container.firstElementChild;
    expect(card?.className).toContain('opacity-60');
  });
});
