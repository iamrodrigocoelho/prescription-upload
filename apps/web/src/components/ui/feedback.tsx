import { Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-body-sm text-content-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-surface px-4 py-10 text-center">
      <Inbox className="size-8 text-content-muted" aria-hidden />
      <p className="text-body font-semibold text-content">{title}</p>
      {children ? <div className="text-body-sm text-content-muted">{children}</div> : null}
    </div>
  );
}
