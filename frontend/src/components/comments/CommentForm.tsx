import React, { useState } from 'react';

interface Props {
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_LENGTH = 2000;

export const CommentForm: React.FC<Props> = ({ onSubmit, onCancel, placeholder = '댓글을 입력하세요...', autoFocus = false }) => {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX_LENGTH}
        rows={3}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{body.length}/{MAX_LENGTH}</span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm px-3 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              취소
            </button>
          )}
          <button
            type="submit"
            disabled={!body.trim() || submitting}
            className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </form>
  );
};
