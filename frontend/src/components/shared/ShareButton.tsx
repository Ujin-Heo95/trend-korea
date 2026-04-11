import React, { useState, useEffect } from 'react';
import { initKakao, shareToKakao, isKakaoAvailable } from '../../lib/kakao';
import { trackEvent } from '../../lib/analytics';

interface Props {
  url: string;
  title: string;
  description?: string;
  thumbnail?: string;
}

export const ShareButton: React.FC<Props> = ({ url, title, description, thumbnail }) => {
  const [copied, setCopied] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);

  useEffect(() => {
    initKakao().then(() => setKakaoReady(isKakaoAvailable()));
  }, []);

  const handleKakaoShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    trackEvent('share_kakao', { title: title.slice(0, 50) });
    await shareToKakao({ title, description, imageUrl: thumbnail, linkUrl: url });
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      trackEvent('share_link', { title: title.slice(0, 50) });
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // user cancelled share dialog or clipboard denied
    }
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      {kakaoReady && (
        <button
          type="button"
          onClick={handleKakaoShare}
          className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded transition-colors"
          style={{ color: '#3C1E1E', backgroundColor: '#FEE500' }}
          aria-label="카카오톡 공유"
          title="카카오톡 공유"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C6.48 3 2 6.58 2 10.9c0 2.78 1.86 5.22 4.65 6.6l-.96 3.56c-.07.26.2.47.44.33l4.1-2.72c.58.08 1.17.13 1.77.13 5.52 0 10-3.58 10-7.9S17.52 3 12 3z" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
        aria-label="링크 공유"
        title="링크 공유"
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>복사됨</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>공유</span>
          </>
        )}
      </button>
    </span>
  );
};
