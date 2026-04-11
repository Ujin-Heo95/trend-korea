interface Props {
  sourceKey: string;
  error: string;
  onClose: () => void;
}

export function ErrorDetailModal({ sourceKey, error, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-lg space-y-4 mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            에러 상세 — <span className="text-red-500">{sourceKey}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <pre className="text-xs text-red-500 dark:text-red-400 bg-slate-50 dark:bg-slate-900 rounded-lg p-4 overflow-auto max-h-80 whitespace-pre-wrap break-all">
          {error}
        </pre>
      </div>
    </div>
  );
}
