import React, { useRef, useState, useEffect, useCallback } from 'react';

interface Props {
  children: React.ReactNode;
  role?: string;
  ariaLabel?: string;
  className?: string;
}

type FadeDir = '' | 'scroll-fade-right' | 'scroll-fade-left' | 'scroll-fade-both';

export const HorizontalScrollRow: React.FC<Props> = ({ children, role, ariaLabel, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<FadeDir>('');

  const updateFade = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth + 1;
    if (!hasOverflow) { setFade(''); return; }

    const atStart = scrollLeft <= 1;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

    if (atStart && !atEnd) setFade('scroll-fade-right');
    else if (!atStart && atEnd) setFade('scroll-fade-left');
    else if (!atStart && !atEnd) setFade('scroll-fade-both');
    else setFade('');
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(updateFade);
    window.addEventListener('resize', updateFade);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateFade);
    };
  }, [updateFade]);

  return (
    <div
      ref={ref}
      role={role}
      aria-label={ariaLabel}
      onScroll={updateFade}
      className={`flex overflow-x-auto scrollbar-hide ${fade} ${className}`}
    >
      {children}
    </div>
  );
};
