import { useEffect } from 'react';

const BASE_TITLE = '실시간 이슈 - Trend Korea';

export function useDocumentTitle(subtitle?: string) {
  useEffect(() => {
    document.title = subtitle ? `${subtitle} | ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [subtitle]);
}
