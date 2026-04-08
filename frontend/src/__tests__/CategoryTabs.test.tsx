import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CategoryTabs } from '../components/CategoryTabs';

describe('CategoryTabs', () => {
  const expectedLabels = [
    '전체', '커뮤니티', '뉴스', '영상', '핫딜', '엔터테인먼트', '여행',
  ];

  it('renders all category tabs', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);

    for (const label of expectedLabels) {
      expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('renders correct number of tabs', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(8);
  });

  it('marks the selected tab with aria-selected=true', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);

    const allTab = screen.getByRole('tab', { name: /전체/ });
    expect(allTab).toHaveAttribute('aria-selected', 'true');

    const communityTab = screen.getByRole('tab', { name: /커뮤니티/ });
    expect(communityTab).toHaveAttribute('aria-selected', 'false');
  });

  it('marks community tab as selected when community is selected', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected="community" onChange={onChange} />);

    const communityTab = screen.getByRole('tab', { name: /커뮤니티/ });
    expect(communityTab).toHaveAttribute('aria-selected', 'true');

    const allTab = screen.getByRole('tab', { name: /전체/ });
    expect(allTab).toHaveAttribute('aria-selected', 'false');
  });

  it('applies selected styling to active tab', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);

    const allTab = screen.getByRole('tab', { name: /전체/ });
    expect(allTab.className).toContain('bg-blue-600');
    expect(allTab.className).toContain('text-white');
  });

  it('applies unselected styling to inactive tabs', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);

    const communityTab = screen.getByRole('tab', { name: /커뮤니티/ });
    expect(communityTab.className).not.toContain('bg-blue-600');
    expect(communityTab.className).toContain('border');
  });

  it('calls onChange with the correct category key when clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: /커뮤니티/ }));
    expect(onChange).toHaveBeenCalledWith('community');
  });

  it('calls onChange with undefined when "전체" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategoryTabs selected="community" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: /전체/ }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('calls onChange with comma-separated key for compound categories', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: /뉴스/ }));
    expect(onChange).toHaveBeenCalledWith('news,newsletter,tech');
  });

  it('has proper tablist role on container', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('has aria-label on tablist', () => {
    const onChange = vi.fn();
    render(<CategoryTabs selected={undefined} onChange={onChange} />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', '카테고리');
  });
});
