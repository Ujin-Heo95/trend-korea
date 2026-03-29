import React from 'react';

interface Props {
  href: string;
  label: string;
  className?: string;
}

export const ExternalLinkButton: React.FC<Props> = ({ href, label, className = '' }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors ${className}`}
    onClick={(e) => e.stopPropagation()}
  >
    {label}
  </a>
);
