'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, type ButtonProps } from './button';
import { useToast } from './toast';

/** Ação de copiar (DESIGN.md §10.3) com confirmação visual e anunciada. */
export function CopyButton({
  value,
  label = 'Copiar link',
  copiedMessage = 'Link copiado.',
  ...props
}: { value: string; label?: string; copiedMessage?: string } & Omit<
  ButtonProps,
  'onClick' | 'value'
>) {
  const notify = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      notify(copiedMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Não foi possível copiar. Selecione o texto e copie manualmente.', 'error');
    }
  }

  return (
    <Button onClick={() => void copy()} {...props}>
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? 'Copiado' : label}
    </Button>
  );
}
