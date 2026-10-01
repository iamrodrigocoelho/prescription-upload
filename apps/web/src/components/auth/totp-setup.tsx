'use client';

import type { TotpConfirmResponse, TotpSetupResponse } from '@receita/shared';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CodeInput } from '@/components/ui/code-input';
import { CopyButton } from '@/components/ui/copy-button';
import { api, ApiError, errorMessage } from '@/lib/api';

/** Lista de códigos de recuperação exibida uma única vez, com cópia e download. */
export function RecoveryCodes({
  codes,
  onDone,
  doneLabel,
}: {
  codes: string[];
  onDone: () => void;
  doneLabel: string;
}) {
  const [saved, setSaved] = useState(false);
  const text = codes.join('\n');

  function download() {
    const blob = new Blob(
      [
        `Receita Venancio — códigos de recuperação\nCada código pode ser usado uma única vez.\n\n${text}\n`,
      ],
      { type: 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'receita-venancio-codigos-recuperacao.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning" title="Guarde estes códigos em local seguro">
        <p>
          Eles permitem entrar caso você perca o acesso ao aplicativo autenticador. Cada código
          funciona uma única vez e eles não serão exibidos novamente.
        </p>
      </Alert>
      <ul
        className="grid grid-cols-2 gap-2 rounded-card bg-subtle p-4 font-mono text-body"
        aria-label="Códigos de recuperação"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton
          value={text}
          label="Copiar códigos"
          copiedMessage="Códigos copiados."
          variant="secondary"
        />
        <Button variant="secondary" onClick={download}>
          <Download className="size-4" aria-hidden />
          Baixar arquivo
        </Button>
      </div>
      <Checkbox
        label="Guardei os códigos em local seguro"
        checked={saved}
        onCheckedChange={setSaved}
      />
      <Button disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}

/**
 * Ativação do 2FA (PRD §15.3): QR Code → código de 6 dígitos → códigos de recuperação.
 */
export function TotpSetup({
  onCompleted,
  doneLabel,
}: {
  onCompleted: () => void;
  doneLabel: string;
}) {
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  const setup = useMutation<TotpSetupResponse, ApiError>({
    mutationFn: () => api<TotpSetupResponse>('/auth/totp/setup', { method: 'POST' }),
  });
  const confirm = useMutation<TotpConfirmResponse, ApiError, string>({
    mutationFn: (value) =>
      api<TotpConfirmResponse>('/auth/totp/confirm', { method: 'POST', body: { code: value } }),
    onSuccess: (result) => setCodes(result.recoveryCodes),
    onError: () => setCode(''),
  });

  if (codes) return <RecoveryCodes codes={codes} onDone={onCompleted} doneLabel={doneLabel} />;

  if (!setup.data) {
    return (
      <div className="flex flex-col gap-4">
        <ol className="list-decimal space-y-1 pl-5 text-body-sm text-content-secondary">
          <li>Instale um aplicativo autenticador (por exemplo, Google Authenticator).</li>
          <li>Leia o QR Code que será exibido.</li>
          <li>Informe o código de 6 dígitos gerado pelo aplicativo.</li>
        </ol>
        {setup.error ? <Alert tone="error" title={errorMessage(setup.error)} /> : null}
        <Button loading={setup.isPending} onClick={() => setup.mutate()}>
          Começar configuração
        </Button>
      </div>
    );
  }

  const secretGroups = setup.data.secret.match(/.{1,4}/g)?.join(' ') ?? setup.data.secret;

  function submit(event: FormEvent) {
    event.preventDefault();
    confirm.mutate(code);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada pela API */}
      <img
        src={setup.data.qrCodeDataUrl}
        alt="QR Code para cadastrar a conta no aplicativo autenticador"
        width={200}
        height={200}
        className="self-center rounded-card border border-line"
      />
      <div className="flex flex-col gap-1">
        <p className="text-label font-medium">Não consegue ler o QR Code? Digite a chave:</p>
        <code className="rounded-input bg-subtle px-3 py-2 font-mono text-body-sm break-all">
          {secretGroups}
        </code>
      </div>
      <CodeInput
        label="Código de 6 dígitos"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        error={
          confirm.error
            ? confirm.error.code === 'INVALID_MFA_CODE'
              ? 'Código inválido. Confira o horário do celular e tente novamente.'
              : errorMessage(confirm.error)
            : undefined
        }
      />
      <Button type="submit" loading={confirm.isPending} disabled={code.length !== 6}>
        Ativar verificação em duas etapas
      </Button>
    </form>
  );
}
