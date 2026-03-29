import React from 'react';

interface Props {
  label: string;
  className?: string;
}

export const DataFreshnessLabel: React.FC<Props> = ({ label, className = '' }) => (
  <span className={`text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium ${className}`}>
    {label}
  </span>
);
