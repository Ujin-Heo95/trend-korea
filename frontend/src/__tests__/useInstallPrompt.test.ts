import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

const VISIT_KEY = 'weeklit:visit-count';
const DISMISS_KEY = 'weeklit:install-dismissed-at';

interface MockEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): MockEvent {
  const event = new Event('beforeinstallprompt') as MockEvent;
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

function setMatchMedia(matchers: Record<string, boolean>) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matchers[query] ?? false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  setMatchMedia({ '(max-width: 768px)': true });
  setUserAgent(ANDROID_UA);
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useInstallPrompt', () => {
  it('hidden on first visit (visit_count < 2)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(VISIT_KEY)).toBe('1');
  });

  it('Android variant on second visit after beforeinstallprompt fires', async () => {
    localStorage.setItem(VISIT_KEY, '1');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(false);

    await act(async () => {
      fireBeforeInstallPrompt();
    });
    expect(result.current.visible).toBe(true);
    expect(result.current.variant).toBe('android');
  });

  it('iOS variant shown without beforeinstallprompt on iOS Safari', () => {
    setUserAgent(IOS_UA);
    localStorage.setItem(VISIT_KEY, '1');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(true);
    expect(result.current.variant).toBe('ios');
  });

  it('hidden when already installed (display-mode: standalone)', () => {
    localStorage.setItem(VISIT_KEY, '5');
    setMatchMedia({ '(display-mode: standalone)': true, '(max-width: 768px)': true });
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(false);
  });

  it('hidden when dismissed within 30 days', () => {
    localStorage.setItem(VISIT_KEY, '5');
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setUserAgent(IOS_UA);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(false);
  });

  it('shown again after dismissal older than 30 days', () => {
    localStorage.setItem(VISIT_KEY, '5');
    localStorage.setItem(DISMISS_KEY, String(Date.now() - 31 * 24 * 60 * 60 * 1000));
    setUserAgent(IOS_UA);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(true);
  });

  it('hidden on desktop (viewport > 768px)', () => {
    localStorage.setItem(VISIT_KEY, '5');
    setMatchMedia({ '(max-width: 768px)': false });
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(false);
  });

  it('dismiss() persists timestamp and hides banner', () => {
    localStorage.setItem(VISIT_KEY, '5');
    setUserAgent(IOS_UA);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.visible).toBe(true);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(DISMISS_KEY)).toBeTruthy();
  });
});
