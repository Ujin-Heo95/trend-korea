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
    className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-700 transition-colors ${className}`}
    onClick={(e) => e.stopPropagation()}
  >
    {label}
  </a>
);
