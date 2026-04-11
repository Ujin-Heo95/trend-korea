const MONITORING_LINKS: { label: string; url: string; color: string }[] = [
  { label: 'Umami Analytics', url: 'https://cloud.umami.is', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  { label: 'Sentry', url: 'https://sentry.io', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { label: 'UptimeRobot', url: 'https://uptimerobot.com/dashboard', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  { label: 'Google Search Console', url: 'https://search.google.com/search-console', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { label: '네이버 서치어드바이저', url: 'https://searchadvisor.naver.com', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { label: 'Fly.io Dashboard', url: 'https://fly.io/dashboard', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { label: 'Supabase Dashboard', url: 'https://supabase.com/dashboard', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { label: 'Cloudflare Pages', url: 'https://dash.cloudflare.com', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
];

const CHECKLIST = [
  { label: 'Umami 커스텀 이벤트 8종 삽입', done: true },
  { label: '프론트엔드 Sentry 통합 (@sentry/react)', done: true },
  { label: 'Sentry 백엔드 DSN 설정 (fly secrets)', done: true },
  { label: 'Sentry 프론트엔드 DSN 설정 (CF Pages)', done: true },
  { label: 'UptimeRobot /health 모니터 등록', done: true },
  { label: 'Google Search Console 등록 + sitemap 제출', done: false },
  { label: '네이버 서치어드바이저 등록 + sitemap 제출', done: false },
];

export function MonitoringTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">외부 서비스 바로가기</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MONITORING_LINKS.map(link => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 ${link.color}`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">방문자 분석 (Umami)</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Umami Cloud 대시보드에서 Share URL을 활성화하면 아래에 임베드됩니다.
        </p>
        <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
          <a href="https://cloud.umami.is" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:text-blue-600 underline">
            Umami 대시보드 열기
          </a>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">모니터링 체크리스트</h2>
        <div className="space-y-2 text-sm">
          {CHECKLIST.map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${
                item.done
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
              }`}>
                {item.done ? '✓' : '·'}
              </span>
              <span className={item.done ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
