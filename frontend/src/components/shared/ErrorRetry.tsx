import React from 'react';

interface Props {
  message?: string;
  onRetry: () => void;
}

export const ErrorRetry: React.FC<Props> = ({
  message = '데이터를 불러오지 못했습니다.',
  onRetry,
}) => (
  <div className="text-center py-10">
    <p className="text-red-500 mb-3">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
    >
      다시 시도
    </button>
  </div>
);
