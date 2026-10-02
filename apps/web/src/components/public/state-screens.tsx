import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { SUBMISSION_MESSAGES } from '@receita/shared';

function StateScreen({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-4 py-10 text-center" aria-live="polite">
      {icon}
      <h1 className="text-h2 font-semibold text-content">{title}</h1>
      {children}
    </section>
  );
}

/** DESIGN §6.7 / §13.2: apenas a confirmação, sem protocolo nem dados pessoais. */
export function SuccessState() {
  return (
    <StateScreen
      icon={<CircleCheck className="size-16 text-success" aria-hidden />}
      title={SUBMISSION_MESSAGES.success}
    />
  );
}

/** DESIGN §6.9: link inválido, expirado, revogado ou utilizado — mensagem neutra. */
export function LinkUnavailableState() {
  return (
    <StateScreen
      icon={<CircleAlert className="size-16 text-content-muted" aria-hidden />}
      title={SUBMISSION_MESSAGES.linkUnavailable}
    />
  );
}

/** DESIGN §6.10: loja indisponível (também usada para link de loja inexistente). */
export function StoreUnavailableState() {
  return (
    <StateScreen
      icon={<CircleAlert className="size-16 text-content-muted" aria-hidden />}
      title={SUBMISSION_MESSAGES.storeUnavailable}
    />
  );
}

export function LoadingState() {
  return (
    <div role="status" className="flex flex-col gap-4 py-6" aria-label="Carregando">
      <div className="h-8 w-2/3 animate-pulse rounded-card bg-subtle" />
      <div className="h-4 w-full animate-pulse rounded-card bg-subtle" />
      <div className="h-40 w-full animate-pulse rounded-card bg-subtle" />
    </div>
  );
}
