'use client';

import { SUBMISSION_MESSAGES } from '@receita/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { track } from '@/lib/analytics';
import { canSubmit } from '@/lib/submission/can-submit';
import { cpfFieldState } from '@/lib/submission/cpf-field';
import { addFiles, type RejectedFile, type SelectedFile } from '@/lib/submission/files';
import { sendSubmission } from '@/lib/submission/send';
import { FileDropzone } from './file-dropzone';
import { FileList } from './file-list';
import { PrivacyNotice } from './privacy-notice';
import { Recaptcha, type RecaptchaHandle } from './recaptcha';
import { SuccessState } from './state-screens';

export interface PublicStore {
  storeNumber: string;
  storeName: string;
}

export type SubmissionContext =
  | { kind: 'store_link'; slug: string; store: PublicStore }
  | { kind: 'generic'; storeId: string; store: PublicStore; onChangeStore: () => void }
  | { kind: 'personalized'; store: PublicStore };

type Phase = 'idle' | 'submitting' | 'success';

const now = (): number => Date.now();
const elapsedSince = (start: number): number => now() - start;

const ENDPOINT: Record<SubmissionContext['kind'], string> = {
  store_link: '/api/public/prescriptions',
  generic: '/api/public/prescriptions',
  // Contexto em cookie (D-047): o token não trafega mais na URL.
  personalized: '/api/public/patient-link-sessions/current/prescriptions',
};

/**
 * Formulário único das três entradas públicas (DESIGN §6.2, §13.1, §13.3). A
 * variação fica no contexto: o CPF existe apenas no fluxo público/genérico.
 */
export function SubmissionForm({
  context,
  siteKey,
  nonce,
  onUnavailable,
}: {
  context: SubmissionContext;
  siteKey: string;
  nonce: string | undefined;
  onUnavailable: (reason: 'store' | 'link') => void;
}) {
  const withCpf = context.kind !== 'personalized';
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [cpfRaw, setCpfRaw] = useState('');
  const [cpfTouched, setCpfTouched] = useState(false);
  const [cpfServerError, setCpfServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  const idempotencyKey = useRef<string | null>(null);
  const captchaRef = useRef<RecaptchaHandle>(null);
  const cpfRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const captchaMessageRef = useRef<HTMLParagraphElement>(null);
  const guidanceId = useId();
  const startedAt = useRef(0);

  const cpf = cpfFieldState(cpfRaw, cpfTouched);
  const cpfError = cpfServerError ?? cpf.error;
  const submitting = phase === 'submitting';
  const enabled = canSubmit({
    fileCount: files.length,
    hasFileErrors: files.some((file) => file.error),
    contextReady: true,
    cpf: withCpf ? { value: cpf.value, valid: cpf.valid } : null,
    captchaToken,
    submitting,
  });

  useEffect(() => {
    startedAt.current = now();
    track('prescription_page_viewed', { entry: context.kind });
  }, [context.kind]);

  /** Qualquer mudança nos dados do envio gera uma nova tentativa (nova chave). */
  function changed() {
    idempotencyKey.current = null;
    setGeneralError(null);
  }

  function onFiles(incoming: File[]) {
    const result = addFiles(files, incoming);
    setFiles(result.files);
    setRejected(result.rejected);
    changed();
    const added = result.files.length - files.length;
    for (const item of result.files.slice(files.length)) {
      track('file_added', { entry: context.kind, fileType: item.kind });
    }
    for (const item of result.rejected) {
      track('file_validation_failed', {
        entry: context.kind,
        reason:
          item.message === SUBMISSION_MESSAGES.fileTooLarge
            ? 'too_large'
            : item.message === SUBMISSION_MESSAGES.tooManyFiles
              ? 'too_many'
              : 'format',
      });
    }
    setAnnouncement(
      [
        added > 0 ? `${added} arquivo(s) adicionado(s).` : '',
        ...result.rejected.map((item) => `${item.name}: ${item.message}`),
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  function onRemove(id: string) {
    const removed = files.find((file) => file.id === id);
    setFiles(files.filter((file) => file.id !== id));
    setRejected([]);
    changed();
    if (removed) {
      track('file_removed', { entry: context.kind, fileType: removed.kind });
      setAnnouncement(`${removed.file.name} removido.`);
    }
  }

  function onCaptcha(token: string | null) {
    setCaptchaToken(token);
    if (token) {
      setCaptchaError(null);
      track('recaptcha_completed', { entry: context.kind });
    } else if (phase !== 'submitting') {
      // Expirou ou falhou: o botão volta a ficar desabilitado (DESIGN §7).
      setCaptchaError(SUBMISSION_MESSAGES.captchaPending);
    }
  }

  async function submit() {
    if (!enabled || !captchaToken) return;
    idempotencyKey.current ??= crypto.randomUUID();
    const fields: Record<string, string> = { captchaToken };
    if (context.kind === 'store_link') fields.slug = context.slug;
    if (context.kind === 'generic') fields.storeId = context.storeId;
    if (withCpf && cpf.value) fields.cpf = cpf.value;

    setPhase('submitting');
    setProgress(0);
    setGeneralError(null);
    setCaptchaError(null);
    setCpfServerError(null);
    setAnnouncement('Enviando receita…');
    track('prescription_submit_started', { entry: context.kind, fileCount: files.length });

    try {
      await sendSubmission({
        url: ENDPOINT[context.kind],
        fields,
        files: files.map((item) => item.file),
        idempotencyKey: idempotencyKey.current,
        onProgress: (percent) => {
          setProgress(percent);
          if (percent % 25 === 0) setAnnouncement(`Enviando: ${percent}%`);
        },
      });
      idempotencyKey.current = null;
      setPhase('success');
      track('prescription_submit_succeeded', {
        entry: context.kind,
        fileCount: files.length,
        durationMs: elapsedSince(startedAt.current),
      });
      if (context.kind === 'personalized') track('personalized_link_upload_succeeded', {});
    } catch (error) {
      setPhase('idle');
      // O token do captcha é de uso único: nova verificação é necessária.
      captchaRef.current?.reset();
      handleError(error);
    }
  }

  function handleError(error: unknown) {
    const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR';
    track('prescription_submit_failed', { entry: context.kind, code });

    if (code === 'LINK_UNAVAILABLE') return onUnavailable('link');
    if (code === 'STORE_UNAVAILABLE') return onUnavailable('store');

    if (error instanceof ApiError) {
      const fileIssues = error.issues.filter((issue) => issue.path.startsWith('files.'));
      if (fileIssues.length > 0) {
        const marked = files.map((file, index) => {
          const issue = fileIssues.find((item) => item.path === `files.${index}`);
          return issue ? { ...file, error: issue.message } : file;
        });
        setFiles(marked);
        setAnnouncement(fileIssues.map((issue) => issue.message).join(' '));
        const first = marked.find((file) => file.error);
        requestAnimationFrame(() => document.getElementById(`arquivo-${first?.id ?? ''}`)?.focus());
        return;
      }
      const cpfIssue = error.issues.find((issue) => issue.path === 'cpf');
      if (cpfIssue) {
        setCpfServerError(cpfIssue.message);
        requestAnimationFrame(() => cpfRef.current?.focus());
        return;
      }
      if (code === 'CAPTCHA_FAILED') {
        setCaptchaError(SUBMISSION_MESSAGES.captchaPending);
        requestAnimationFrame(() => captchaMessageRef.current?.focus());
        return;
      }
      if (
        error.issues[0]?.message &&
        code === 'VALIDATION_FAILED' &&
        error.issues[0].path === 'files'
      ) {
        setGeneralError(error.issues[0].message);
        requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }
    }
    setGeneralError(SUBMISSION_MESSAGES.generalFailure);
    setAnnouncement(SUBMISSION_MESSAGES.generalFailure);
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  if (phase === 'success') return <SuccessState />;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-h1 font-semibold text-content">{SUBMISSION_MESSAGES.title}</h1>
        <p className="text-body text-content-secondary">
          {context.kind === 'personalized'
            ? SUBMISSION_MESSAGES.personalizedSupport
            : SUBMISSION_MESSAGES.support}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-content-secondary">
        <span>
          Loja: {context.store.storeNumber} · {context.store.storeName}
        </span>
        {context.kind === 'generic' ? (
          <Button
            variant="tertiary"
            size="sm"
            onClick={context.onChangeStore}
            disabled={submitting}
          >
            Trocar loja
          </Button>
        ) : null}
      </div>

      {withCpf ? (
        <TextField
          ref={cpfRef}
          label={SUBMISSION_MESSAGES.cpfLabel}
          inputMode="numeric"
          autoComplete="off"
          value={cpf.value}
          disabled={submitting}
          onChange={(event) => {
            setCpfRaw(event.target.value);
            setCpfServerError(null);
            changed();
          }}
          onBlur={() => {
            setCpfTouched(true);
            if (cpf.value && cpf.valid) track('cpf_entered', { entry: context.kind });
          }}
          error={cpfError}
        />
      ) : null}

      <FileDropzone
        onFiles={onFiles}
        disabled={submitting}
        limitReached={files.length >= 10}
        describedBy={guidanceId}
      />

      {rejected.length > 0 ? (
        <Alert tone="error">
          <ul className="flex flex-col gap-1">
            {rejected.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span className="font-semibold">{item.name}</span>: {item.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <FileList files={files} onRemove={onRemove} disabled={submitting} />

      <p id={guidanceId} className="text-body-sm text-content-muted">
        {SUBMISSION_MESSAGES.guidance}
      </p>

      <div className="flex flex-col gap-2">
        <Recaptcha ref={captchaRef} siteKey={siteKey} nonce={nonce} onToken={onCaptcha} />
        {captchaError ? (
          <p ref={captchaMessageRef} tabIndex={-1} className="text-caption text-error" role="alert">
            {captchaError}
          </p>
        ) : null}
      </div>

      {generalError ? <Alert ref={alertRef} tone="error" title={generalError} /> : null}

      {submitting ? (
        <div
          role="progressbar"
          aria-label="Progresso do envio"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 w-full overflow-hidden rounded-full bg-subtle"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      <Button type="submit" disabled={!enabled} loading={submitting} className="w-full">
        {generalError ? 'Tentar novamente' : SUBMISSION_MESSAGES.submit}
      </Button>

      <PrivacyNotice />
    </form>
  );
}
