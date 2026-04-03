import { useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const THRESHOLD = 60;

function createSpinner(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-700 shadow-lg border border-slate-200 dark:border-slate-600';
  const spinner = document.createElement('div');
  spinner.className = 'w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin';
  wrapper.appendChild(spinner);
  return wrapper;
}

function createArrowIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'w-4 h-4 text-blue-500 transition-transform');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M19 14l-7 7m0 0l-7-7m7 7V3');
  svg.appendChild(path);
  return svg;
}

export function usePullToRefresh(containerRef: React.RefObject<HTMLElement | null>) {
  const queryClient = useQueryClient();
  const startY = useRef(0);
  const pulling = useRef(false);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<SVGSVGElement | null>(null);

  const createIndicator = useCallback(() => {
    if (indicatorRef.current) return indicatorRef.current;

    const el = document.createElement('div');
    el.className = 'fixed top-0 left-0 right-0 z-50 flex justify-center pt-3 pointer-events-none transition-transform';
    el.style.transform = 'translateY(-100%)';

    const circle = document.createElement('div');
    circle.className = 'w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-700 shadow-lg border border-slate-200 dark:border-slate-600';
    const arrow = createArrowIcon();
    circle.appendChild(arrow);
    el.appendChild(circle);

    document.body.appendChild(el);
    indicatorRef.current = el;
    arrowRef.current = arrow;
    return el;
  }, []);

  const removeIndicator = useCallback(() => {
    const el = indicatorRef.current;
    if (!el) return;
    el.style.transform = 'translateY(-100%)';
    setTimeout(() => { el.remove(); indicatorRef.current = null; arrowRef.current = null; }, 300);
  }, []);

  useEffect(() => {
    const container = containerRef.current ?? document.body;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 10) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy < 0) { pulling.current = false; return; }

      const indicator = createIndicator();
      const progress = Math.min(dy / THRESHOLD, 1);
      indicator.style.transform = `translateY(${progress * 40 - 40}px)`;

      if (arrowRef.current) {
        arrowRef.current.style.transform = dy > THRESHOLD ? 'rotate(180deg)' : '';
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!pulling.current) return;
      pulling.current = false;

      const dy = e.changedTouches[0].clientY - startY.current;

      if (dy > THRESHOLD) {
        // Replace arrow with spinner
        const el = indicatorRef.current;
        if (el) {
          const circle = el.firstElementChild;
          if (circle) {
            circle.replaceChildren(createSpinner().firstElementChild!);
          }
        }
        queryClient.invalidateQueries().then(() => removeIndicator());
      } else {
        removeIndicator();
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      indicatorRef.current?.remove();
    };
  }, [containerRef, queryClient, createIndicator, removeIndicator]);
}
