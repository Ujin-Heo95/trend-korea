import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { VoteButton } from '../components/shared/VoteButton';

describe('VoteButton', () => {
  it('renders the vote count', () => {
    render(<VoteButton postId={1} voteCount={5} hasVoted={false} onVote={vi.fn()} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not render count when voteCount is 0', () => {
    const { container } = render(<VoteButton postId={1} voteCount={0} hasVoted={false} onVote={vi.fn()} />);
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(0);
  });

  it('increments count optimistically on click', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();

    render(<VoteButton postId={1} voteCount={3} hasVoted={false} onVote={onVote} />);
    expect(screen.getByText('3')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(onVote).toHaveBeenCalledWith(1, expect.any(Function));
  });

  it('is disabled when hasVoted is true', () => {
    render(<VoteButton postId={1} voteCount={5} hasVoted={true} onVote={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call onVote when hasVoted is true', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();

    render(<VoteButton postId={1} voteCount={5} hasVoted={true} onVote={onVote} />);
    await user.click(screen.getByRole('button'));

    expect(onVote).not.toHaveBeenCalled();
  });

  it('rolls back optimistic count when onCountUpdate receives -1', async () => {
    const user = userEvent.setup();
    let capturedCallback: ((count: number) => void) | undefined;
    const onVote = vi.fn((_postId: number, cb?: (count: number) => void) => {
      capturedCallback = cb;
    });

    render(<VoteButton postId={1} voteCount={10} hasVoted={false} onVote={onVote} />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('11')).toBeInTheDocument();

    // Simulate API failure rollback
    act(() => {
      capturedCallback!(-1);
    });
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('updates to server count on successful vote', async () => {
    const user = userEvent.setup();
    let capturedCallback: ((count: number) => void) | undefined;
    const onVote = vi.fn((_postId: number, cb?: (count: number) => void) => {
      capturedCallback = cb;
    });

    render(<VoteButton postId={1} voteCount={10} hasVoted={false} onVote={onVote} />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('11')).toBeInTheDocument();

    // Server returns actual count
    act(() => {
      capturedCallback!(12);
    });
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows correct aria-label based on hasVoted', () => {
    const { rerender } = render(
      <VoteButton postId={1} voteCount={0} hasVoted={false} onVote={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', '추천');

    rerender(
      <VoteButton postId={1} voteCount={1} hasVoted={true} onVote={vi.fn()} />
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', '추천함');
  });
});
