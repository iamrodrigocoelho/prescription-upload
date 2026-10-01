export type CaptchaFailureReason = 'missing' | 'invalid' | 'duplicate' | 'hostname' | 'unavailable';

export type CaptchaResult = { ok: true } | { ok: false; reason: CaptchaFailureReason };

/**
 * Verificação server-side de captcha (PRD §10.2, RF-012). O domínio depende só
 * desta interface: trocar por reCAPTCHA Enterprise é criar outro adapter.
 */
export abstract class CaptchaVerifier {
  abstract verify(token: string | undefined, remoteIp: string | undefined): Promise<CaptchaResult>;
}
