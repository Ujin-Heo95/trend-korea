import { useState, useEffect, useCallback } from 'react';

const VISIT_KEY = 'weeklit:visit-count';
const DISMISS_KEY = 'weeklit:install-dismissed-at';
const INSTALLED_KEY = 'weeklit:pwa-installed';
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_VISITS = 2;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallVariant = 'android' | 'ios' | null;

function readNumber(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const win = window as Window & { MSStream?: unknown };
  return /iPad|iPhone|iPod/.test(ua) && !win.MSStream;
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 768px)').matches ?? false;
}

function isDismissedRecently(): boolean {
  const ts = readNumber(DISMISS_KEY);
  if (!ts) return false;
  return Date.now() - ts < DISMISS_TTL_MS;
}

function bumpVisitCount(): number {
  const next = readNumber(VISIT_KEY) + 1;
  writeNumber(VISIT_KEY, next);
  return next;
}

interface UseInstallPromptResult {
  variant: InstallVariant;
  visible: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [variant, setVariant] = useState<InstallVariant>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already installed → never show, persist for analytics.
    if (isStandalone()) {
      try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* ignore */ }
      return;
    }

    // Visit count is bumped once per page load.
    const visits = bumpVisitCount();
    if (!isMobileViewport()) return;
    if (isDismissedRecently()) return;
    if (visits < MIN_VISITS) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVariant('android');
      setVisible(true);
    };

    const onAppInstalled = () => {
      try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* ignore */ }
      const w = window as Window & { umami?: { track: (event: string) => void } };
      w.umami?.track('pwa_installed');
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    // iOS Safari has no beforeinstallprompt — show iOS variant directly.
    if (isIOS()) {
      setVariant('ios');
      setVisible(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    const w = window as Window & { umami?: { track: (event: string) => void } };
    w.umami?.track('pwa_install_clicked');
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'dismissed') {
      writeNumber(DISMISS_KEY, Date.now());
    }
    setDeferred(null);
    setVisible(false);
  }, [deferred]);

  const dismiss = useCallback(() => {
    writeNumber(DISMISS_KEY, Date.now());
    setVisible(false);
  }, []);

  return { variant, visible, promptInstall, dismiss };
}
