import React from 'react';

interface Props {
  children: React.ReactNode;
  role?: string;
  ariaLabel?: string;
  className?: string;
}

export const HorizontalScrollRow: React.FC<Props> = ({ children, role, ariaLabel, className = '' }) => (
  <div
    role={role}
    aria-label={ariaLabel}
    className={`flex overflow-x-auto scrollbar-hide scroll-fade ${className}`}
  >
    {children}
  </div>
);
