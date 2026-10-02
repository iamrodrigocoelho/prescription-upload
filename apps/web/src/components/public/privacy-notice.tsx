/**
 * Aviso de privacidade (PRD §22.2) — sem checkbox de consentimento.
 * TODO(juridico): texto PROVISÓRIO; o texto final, a base legal e a URL da política
 * dependem do Jurídico/DPO (PRD §42.9). Ver docs/decisions.md D-049.
 */
export const PRIVACY_NOTICE_PLACEHOLDER =
  'Os dados e arquivos enviados são usados somente para viabilizar o atendimento da sua receita pela Drogaria Venancio.';

export function PrivacyNotice() {
  const url = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL;
  return (
    <p className="text-caption text-content-muted">
      {PRIVACY_NOTICE_PLACEHOLDER}{' '}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-link underline">
          Política de Privacidade
        </a>
      ) : null}
    </p>
  );
}
