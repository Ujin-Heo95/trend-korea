import React, { useEffect, useRef, useState } from 'react';

type AdFormat = 'banner' | 'rectangle' | 'native';

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

const PUB_ID = import.meta.env.VITE_ADSENSE_PUB_ID ?? '';
const IS_DEV = import.meta.env.DEV;

/**
 * AdSense 광고 슬롯.
 * - IntersectionObserver로 뷰포트 진입 시에만 광고 로드 (성능)
 * - min-height 예약으로 CLS 방지
 * - 개발환경에서 플레이스홀더 표시
 * - PUB_ID 미설정 시 렌더링하지 않음
 */
export const AdSlot: React.FC<AdSlotProps> = ({ slotId, format, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const pushed = useRef(false);
  const { minHeight, label } = FORMAT_STYLES[format];

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

  // 광고 push
  useEffect(() => {
    if (!visible || IS_DEV || !PUB_ID || pushed.current) return;
    pushed.current = true;
    try {
      const adsByGoogle = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle;
      if (adsByGoogle) adsByGoogle.push({});
    } catch {
      // AdSense 미로드 시 무시
    }
  }, [visible]);

  // PUB_ID 미설정 + 프로덕션: 렌더링하지 않음
  if (!PUB_ID && !IS_DEV) return null;

  return (
    <div
      ref={containerRef}
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ minHeight }}
    >
      {IS_DEV ? (
        <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-400 dark:text-slate-500" style={{ minHeight }}>
          AD: {label} ({slotId})
        </div>
      ) : visible ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', minHeight }}
          data-ad-client={`ca-pub-${PUB_ID}`}
          data-ad-slot={slotId}
          data-ad-format={format === 'native' ? 'fluid' : 'auto'}
          data-full-width-responsive="true"
        />
      ) : null}
    </div>
  );
};
