import React from 'react';
import { trackEvent } from '../../lib/analytics';

interface AffiliateProduct {
  readonly title: string;
  readonly url: string;
  readonly imageUrl?: string;
  readonly price?: string;
}

interface AffiliateLinkProps {
  readonly products: readonly AffiliateProduct[];
  readonly className?: string;
}

const PARTNER_ID = import.meta.env.VITE_COUPANG_PARTNER_ID ?? '';
const IS_DEV = import.meta.env.DEV;

function buildAffiliateUrl(url: string): string {
  if (!PARTNER_ID) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}subId=${PARTNER_ID}`;
}

/**
 * 쿠팡 파트너스 어필리에이트 링크 컴포넌트.
 * - 관련 상품을 최대 3개까지 표시
 * - "관련 상품" 라벨로 광고임을 명시 (법적 필수)
 * - 콘텐츠와 시각적으로 분리
 * - VITE_COUPANG_PARTNER_ID 미설정 시 렌더링하지 않음
 */
export const AffiliateLink: React.FC<AffiliateLinkProps> = ({ products, className = '' }) => {
  if (!PARTNER_ID && !IS_DEV) return null;
  if (products.length === 0) return null;

  const displayed = products.slice(0, 3);

  const handleClick = (product: AffiliateProduct) => {
    trackEvent('affiliate_click', { title: product.title.slice(0, 50), url: product.url });
  };

  return (
    <div className={`border-t border-slate-200 dark:border-slate-700 pt-4 mt-4 ${className}`}>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
        관련 상품 (파트너스 활동의 일환으로 일정 커미션을 받을 수 있습니다)
      </p>
      <div className="flex gap-3 overflow-x-auto">
        {displayed.map((product, i) => (
          <a
            key={i}
            href={IS_DEV ? '#' : buildAffiliateUrl(product.url)}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            onClick={() => handleClick(product)}
            className="flex-shrink-0 w-32 group"
          >
            {product.imageUrl ? (
              <div className="w-32 h-32 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mb-1.5">
                <img
                  src={product.imageUrl}
                  alt={`${product.title} 상품 이미지`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : (
              <div className="w-32 h-32 rounded-lg bg-slate-100 dark:bg-slate-800 mb-1.5 flex items-center justify-center">
                <span className="text-slate-400 dark:text-slate-500 text-xs">이미지 없음</span>
              </div>
            )}
            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 group-hover:text-blue-500 transition-colors">
              {product.title}
            </p>
            {product.price && (
              <p className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                {product.price}
              </p>
            )}
          </a>
        ))}
      </div>

      {IS_DEV && (
        <p className="text-[10px] text-orange-400 mt-2">
          DEV: Coupang Partner ID = {PARTNER_ID || '(미설정)'}
        </p>
      )}
    </div>
  );
};
