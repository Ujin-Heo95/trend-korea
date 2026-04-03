import { useEffect } from 'react';

const BASE_TITLE = 'WeekLit — 실시간 트렌드 모아보기';

export function useDocumentTitle(subtitle?: string) {
  useEffect(() => {
    document.title = subtitle ? `${subtitle} | ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [subtitle]);
}
