import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

/** Tabela com rolagem horizontal local quando necessário (DESIGN.md §5.3). */
export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full border-collapse text-left text-body-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-line bg-subtle px-3 py-2 text-label font-semibold text-content-secondary',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cx('border-b border-line px-3 py-2 align-middle text-content', className)}
      {...props}
    />
  );
}
