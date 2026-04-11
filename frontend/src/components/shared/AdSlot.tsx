import React, { useEffect, useRef, useState } from 'react';
import { trackEvent } from '../../lib/analytics';

type AdFormat = 'banner' | 'rectangle' | 'native';
type AdProvider = 'adsense' | 'adfit' | 'none';

interface AdSlotProps {
  slotId: string;
  format: AdFormat;
  className?: string;
}

const FORMAT_STYLES: Record<AdFormat, { minHeight: number; label: string }> = {
  banner: { minHeight: 90, label: 'Banner 728×90' },
  rectangle: { minHeight: 250, label: 'Rectangle 300×250' },
  native: { minHeight: 120, label: 'Native In-feed' },
};

const ADSENSE_PUB_ID = import.meta.env.VITE_ADSENSE_PUB_ID ?? '';
const ADFIT_UNIT_ID = import.meta.env.VITE_ADFIT_UNIT_ID ?? '';
const AD_PROVIDER: AdProvider = (import.meta.env.VITE_AD_PROVIDER as AdProvider) ?? 'none';
const IS_DEV = import.meta.env.DEV;

function resolveProvider(): AdProvider {
  if (AD_PROVIDER !== 'none') return AD_PROVIDER;
  if (ADSENSE_PUB_ID) return 'adsense';
  if (ADFIT_UNIT_ID) return 'adfit';
  return 'none';
}

/**
 * 멀티 네트워크 광고 슬롯.
 * - VITE_AD_PROVIDER로 adsense | adfit | none 전환
 * - IntersectionObserver로 뷰포트 진입 시에만 광고 로드 (성능)
 * - min-height 예약으로 CLS 방지
 * - 개발환경에서 플레이스홀더 표시
 */
export const AdSlot: React.FC<AdSlotProps> = ({ slotId, format, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const pushed = useRef(false);
  const { minHeight, label } = FORMAT_STYLES[format];
  const provider = resolveProvider();

  // 뷰포트 진입 감지
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // AdSense push
  useEffect(() => {
    if (!visible || IS_DEV || provider !== 'adsense' || !ADSENSE_PUB_ID || pushed.current) return;
    pushed.current = true;
    try {
      const adsByGoogle = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle;
      if (adsByGoogle) adsByGoogle.push({});
      trackEvent('ad_impression', { provider: 'adsense', slotId });
    } catch {
      // AdSense 미로드 시 무시
    }
  }, [visible, provider, slotId]);

  // Kakao AdFit push
  useEffect(() => {
    if (!visible || IS_DEV || provider !== 'adfit' || !ADFIT_UNIT_ID || pushed.current) return;
    pushed.current = true;
    try {
      const adfit = (window as unknown as { adfit?: { display: (id: string) => void } }).adfit;
      if (adfit) adfit.display(ADFIT_UNIT_ID);
      trackEvent('ad_impression', { provider: 'adfit', slotId });
    } catch {
      // AdFit 미로드 시 무시
    }
  }, [visible, provider, slotId]);

  // 프로덕션에서 provider=none이면 렌더링하지 않음
  if (provider === 'none' && !IS_DEV) return null;

  return (
    <div
      ref={containerRef}
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ minHeight }}
    >
      {IS_DEV ? (
        <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-400 dark:text-slate-500" style={{ minHeight }}>
          AD: {label} ({slotId}) [{provider}]
        </div>
      ) : visible ? (
        provider === 'adsense' ? (
          <ins
            className="adsbygoogle"
            style={{ display: 'block', minHeight }}
            data-ad-client={`ca-pub-${ADSENSE_PUB_ID}`}
            data-ad-slot={slotId}
            data-ad-format={format === 'native' ? 'fluid' : 'auto'}
            data-full-width-responsive="true"
          />
        ) : provider === 'adfit' ? (
          <ins
            className="kakao_ad_area"
            style={{ display: 'block', minHeight }}
            data-ad-unit={ADFIT_UNIT_ID}
            data-ad-width="320"
            data-ad-height={String(minHeight)}
          />
        ) : null
      ) : null}
    </div>
  );
};
