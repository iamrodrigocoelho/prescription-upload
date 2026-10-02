'use client';

import { ChevronDown, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { ROLE_LABELS } from '@/lib/labels';
import { navItemsFor } from '@/lib/navigation';
import { useUnviewedBadge } from '@/lib/prescriptions';
import { RealtimeProvider } from '@/lib/realtime';
import { NotificationCenter, SoundToggle } from './notification-center';
import { useClearSession, useSession } from '@/lib/session';
import { hasPermission, Permission } from '@receita/shared';

/**
 * Shell do Admin. Itens de navegação filtrados por perfil (DESIGN.md §8.2);
 * o backend continua sendo a autoridade sobre cada rota.
 */
export function AdminShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const { me, isLoading, error } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const clearSession = useClearSession();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const next = encodeURIComponent(pathname);
    if (error) router.replace(`/login?next=${next}`);
    else if (me?.sessionStatus === 'MFA_REQUIRED')
      router.replace(`/login/verificacao?next=${next}`);
    else if (me?.sessionStatus === 'MFA_ENROLLMENT_REQUIRED')
      router.replace(`/login/configurar-2fa?next=${next}`);
  }, [error, me, pathname, router]);

  // Fecha o menu móvel ao navegar.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMenuOpen(false), [pathname]);

  if (isLoading || !me || me.sessionStatus !== 'AUTHENTICATED') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
      router.replace('/login');
    }
  }

  const items = navItemsFor(me.user.role);
  const canSeePrescriptions = hasPermission(me.user.role, Permission.PRESCRIPTIONS_READ);
  const nav = (
    <ul className="flex flex-col gap-1 md:flex-row md:gap-0">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'block rounded-button px-3 py-2 text-body-sm font-medium md:rounded-none md:border-b-2 md:py-3',
                active
                  ? 'bg-selected text-content md:border-primary md:bg-transparent'
                  : 'text-content-secondary hover:bg-hover md:border-transparent',
              )}
            >
              {item.label}
              {item.href === '/admin/receitas' ? <UnviewedBadge /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const shell = (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4">
          <Link href="/admin" className="py-3" aria-label="Início do painel">
            {brand}
          </Link>
          <nav aria-label="Principal" className="hidden flex-1 md:block">
            {nav}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {canSeePrescriptions ? <SoundToggle /> : null}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="flex min-h-11 items-center gap-2 rounded-button px-2 text-body-sm hover:bg-hover">
                <span className="flex flex-col items-end leading-tight">
                  <span className="font-semibold text-content">{me.user.name}</span>
                  <span className="text-caption text-content-muted">
                    {ROLE_LABELS[me.user.role]}
                  </span>
                </span>
                <ChevronDown className="size-4" aria-hidden />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-56 rounded-card border border-line bg-surface p-1 shadow-overlay"
                >
                  <DropdownMenu.Label className="px-3 py-2 text-caption text-content-muted">
                    {me.user.email}
                  </DropdownMenu.Label>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/admin/conta/seguranca"
                      className="flex items-center gap-2 rounded-button px-3 py-2 text-body-sm outline-none data-[highlighted]:bg-hover"
                    >
                      <ShieldCheck className="size-4" aria-hidden />
                      Segurança da conta
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => void logout()}
                    className="flex cursor-pointer items-center gap-2 rounded-button px-3 py-2 text-body-sm outline-none data-[highlighted]:bg-hover"
                  >
                    <LogOut className="size-4" aria-hidden />
                    Sair
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-button hover:bg-hover md:hidden"
              aria-expanded={menuOpen}
              aria-controls="menu-movel"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
              <span className="sr-only">{menuOpen ? 'Fechar menu' : 'Abrir menu'}</span>
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav
            id="menu-movel"
            aria-label="Principal"
            className="border-t border-line px-4 py-2 md:hidden"
          >
            {nav}
          </nav>
        ) : null}
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
  return canSeePrescriptions ? (
    <RealtimeProvider>
      {shell}
      <NotificationCenter />
    </RealtimeProvider>
  ) : (
    shell
  );
}

/** Badge de não visualizadas (texto acessível, não depende só de cor). */
function UnviewedBadge() {
  const { data } = useUnviewedBadge(true);
  if (!data) return null;
  return (
    <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-on-primary">
      {data > 99 ? '99+' : data}
      <span className="sr-only"> não visualizadas</span>
    </span>
  );
}
