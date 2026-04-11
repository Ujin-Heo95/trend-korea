import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

import { SearchBar } from '../components/SearchBar';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SearchBar', () => {
  it('renders an input with placeholder', () => {
    render(<SearchBar value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('키워드 검색...')).toBeInTheDocument();
  });

  it('displays the initial value', () => {
    render(<SearchBar value="초기값" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('초기값')).toBeInTheDocument();
  });

  it('debounces onChange by 400ms', () => {
    const onChange = vi.fn();

    render(<SearchBar value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('키워드 검색...');

    // Use fireEvent to avoid userEvent timer issues
    fireEvent.change(input, { target: { value: 'test' } });

    // Before 400ms, onChange should not fire
    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).not.toHaveBeenCalled();

    // After 400ms total from the change
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('does not fire onChange when typed value matches current value', () => {
    const onChange = vi.fn();
    render(<SearchBar value="same" onChange={onChange} />);

    // Value matches, so the debounce should not trigger onChange
    act(() => { vi.advanceTimersByTime(500); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows clear button when input has value and clears on click', () => {
    const onChange = vi.fn();

    render(<SearchBar value="검색어" onChange={onChange} />);

    const clearButton = screen.getByRole('button', { name: '검색어 지우기' });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    // Clear button calls onChange('') immediately (not debounced)
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('does not show clear button when input is empty', () => {
    render(<SearchBar value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '검색어 지우기' })).not.toBeInTheDocument();
  });
});
