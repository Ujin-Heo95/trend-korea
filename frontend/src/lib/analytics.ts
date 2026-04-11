/**
 * Umami analytics wrapper — single entry point for all event tracking.
 * Silent-fail: never throws, never blocks UI.
 */

declare global {
  interface Window {
    umami?: {
      track: (name: string, data?: Record<string, string | number>) => void;
    };
  }
}

export function trackEvent(name: string, data?: Record<string, string | number>): void {
  try {
    window.umami?.track(name, data);
  } catch {
    // silent — analytics must never break the app
  }
}
