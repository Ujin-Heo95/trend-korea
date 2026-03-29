import React, { useState } from 'react';

interface Props {
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  fallbackIcon: string;
  className?: string;
}

function sanitizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  // Mixed content 대응: http → https 시도
  return url.replace(/^http:\/\//i, 'https://');
}

export const PosterImage: React.FC<Props> = ({ src, alt, width, height, fallbackIcon, className = '' }) => {
  const [hasError, setHasError] = useState(false);
  const sanitizedSrc = sanitizeUrl(src);

  if (!sanitizedSrc || hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 rounded-md text-lg ${className}`}
        style={{ width, height }}
      >
        {fallbackIcon}
      </div>
    );
  }

  return (
    <img
      src={sanitizedSrc}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      className={`rounded-md object-cover bg-slate-100 ${className}`}
      style={{ width, height }}
      onError={() => setHasError(true)}
    />
  );
};
