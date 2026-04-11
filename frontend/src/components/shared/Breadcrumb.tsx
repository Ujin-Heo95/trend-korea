import { Link } from 'react-router-dom';
import { BreadcrumbJsonLd } from './JsonLd';

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className="mb-3">
      <BreadcrumbJsonLd items={items} />
      <ol className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1">
              {index > 0 && (
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                  &gt;
                </span>
              )}
              {isLast || !item.href ? (
                <span className={isLast ? 'text-slate-700 dark:text-slate-200 font-medium' : ''}>
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
