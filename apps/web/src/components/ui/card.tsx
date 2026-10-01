import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx('rounded-card border border-line bg-surface p-4 shadow-card sm:p-6', className)}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 font-semibold text-content">{title}</h1>
        {description ? <p className="text-body-sm text-content-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
