import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/** Chave de 32 bytes codificada em base64 (gere com `openssl rand -base64 32`). */
const key32 = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  message: 'deve ser uma chave de 32 bytes em base64',
});

const secret = z.string().min(32, 'deve ter ao menos 32 caracteres');

/** Chave secreta de teste pública do Google (sempre aprova). Proibida em produção. */
export const GOOGLE_TEST_SECRET = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PRETTY: bool.default(false),
    /** Valor repassado ao `trust proxy` do Express (ex.: `loopback`, `1`, lista de IPs). */
    TRUST_PROXY: z.string().default('1'),

    /** URL pública do frontend; base dos links /l/{slug} e /p/{token}. Domínio final pendente. */
    PUBLIC_APP_URL: z.url(),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    REDIS_KEY_PREFIX: z.string().default('rv:'),

    // Criptografia de campos sensíveis (PRD §25)
    CPF_ENCRYPTION_KEY: key32,
    CPF_LOOKUP_PEPPER: secret,
    /** HMAC do termo de busca de pacientes na auditoria (D-071). */
    PATIENT_SEARCH_AUDIT_PEPPER: secret,
    TOTP_ENCRYPTION_KEY: key32,
    /** Segredo para derivar tokens CSRF a partir da sessão. */
    SESSION_SECRET: secret,

    // Sessão
    COOKIE_SECURE: bool.default(true),
    SESSION_IDLE_TIMEOUT_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(30),
    SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 7)
      .default(12),
    MFA_PENDING_TTL_MINUTES: z.coerce.number().int().min(1).max(15).default(5),

    // Proteção contra brute force
    LOGIN_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
    LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
    LOCKOUT_BASE_SECONDS: z.coerce.number().int().positive().default(60),
    LOCKOUT_MAX_SECONDS: z.coerce.number().int().positive().default(1800),

    // Área pública (PRD §10.3): consultas de contexto e envios por IP
    PUBLIC_LOOKUP_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(120),
    PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    PUBLIC_SUBMIT_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(30),
    PUBLIC_SUBMIT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

    // Senha e recuperação
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),

    // E-mail
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().min(3),

    // reCAPTCHA v2 checkbox (PRD §10). Dev/teste: chaves de teste oficiais do Google.
    RECAPTCHA_SECRET_KEY: z.string().min(1),
    /** Hostnames aceitos na resposta do siteverify (separados por vírgula). */
    RECAPTCHA_EXPECTED_HOSTNAMES: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean),
      ),
    RECAPTCHA_VERIFY_URL: z.url().default('https://www.google.com/recaptcha/api/siteverify'),
    RECAPTCHA_TIMEOUT_MS: z.coerce.number().int().min(500).max(15_000).default(5000),

    // Métricas Prometheus. Sem token, o endpoint /metrics fica desabilitado.
    METRICS_TOKEN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(32).optional(),
    ),

    /** Fuso do sistema para "hoje" e agrupamentos por dia (D-077). Nunca UTC implícito. */
    APP_TIMEZONE: z
      .string()
      .default('America/Sao_Paulo')
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en-CA', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, 'fuso horário IANA inválido'),
    /** Intervalo máximo do período personalizado do dashboard (dias). */
    DASHBOARD_MAX_RANGE_DAYS: z.coerce.number().int().min(1).max(730).default(90),

    // Tempo real (SSE)
    REALTIME_HEARTBEAT_SECONDS: z.coerce.number().int().min(5).max(60).default(15),
    REALTIME_REVALIDATE_SECONDS: z.coerce.number().int().min(5).max(300).default(30),
    REALTIME_MAX_STREAMS_PER_USER: z.coerce.number().int().min(1).max(20).default(5),

    // Worker (fila de anexos e outbox)
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(10_000).default(500),
    ATTACHMENTS_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),

    // Pacientes (PRD §27). Desligada, a busca informa indisponibilidade.
    PATIENT_INTEGRATION_ENABLED: bool.default(false),
    /** `mock` (dev/testes; proibido em produção) ou `http` (aguarda contrato). */
    PATIENT_PROVIDER: z.enum(['mock', 'http']).default('http'),
    PATIENT_API_BASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
    PATIENT_API_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    PATIENT_API_TIMEOUT_MS: z.coerce.number().int().min(200).max(10_000).default(2_000),
    PATIENT_API_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    PATIENT_API_BREAKER_THRESHOLD: z.coerce.number().int().min(1).max(50).default(5),
    // Identificação automática por CPF (D-072): job no worker.
    PATIENT_AUTO_IDENTIFICATION_ENABLED: bool.default(false),
    PATIENT_AUTO_IDENTIFICATION_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
    PATIENT_AUTO_IDENTIFICATION_BACKOFF_MS: z.coerce.number().int().min(100).default(30_000),
    // Busca manual: limites anti-enumeração (D-071)
    PATIENT_SEARCH_LIMIT_USER_PER_MINUTE: z.coerce.number().int().positive().default(20),
    PATIENT_SEARCH_LIMIT_USER_PER_HOUR: z.coerce.number().int().positive().default(100),
    PATIENT_SEARCH_LIMIT_SESSION_PER_HOUR: z.coerce.number().int().positive().default(60),
    PATIENT_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(20).default(10),
    /** Validade da referência opaca de seleção de paciente (D-069). */
    PATIENT_SELECTION_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
    PATIENT_API_BREAKER_HALF_OPEN_MS: z.coerce.number().int().min(1_000).default(30_000),

    // Object storage S3-compatible (SeaweedFS)
    STORAGE_ENDPOINT: z.url(),
    /**
     * Endereço do storage visto pelo NAVEGADOR (URLs assinadas). Em produção, um
     * subdomínio servido pelo proxy de borda preservando o Host (D-061). Padrão:
     * STORAGE_ENDPOINT.
     */
    STORAGE_PUBLIC_ENDPOINT: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_BUCKET: z.string().min(3),
    STORAGE_ACCESS_KEY: z.string().min(1),
    STORAGE_SECRET_KEY: z.string().min(1),
    STORAGE_FORCE_PATH_STYLE: bool.default(true),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(900).default(60),
    /** Revelações de CPF por usuário por hora (D-056). */
    CPF_REVEAL_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
  })
  .superRefine((env, ctx) => {
    if (env.PATIENT_AUTO_IDENTIFICATION_ENABLED && !env.PATIENT_INTEGRATION_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['PATIENT_AUTO_IDENTIFICATION_ENABLED'],
        message: 'a identificação automática exige PATIENT_INTEGRATION_ENABLED=true',
      });
    }
    if (env.PATIENT_INTEGRATION_ENABLED && env.PATIENT_PROVIDER === 'http') {
      // Contrato da API ainda não definido (PRD §42.4): ver docs/integrations/patients-api-checklist.md.
      ctx.addIssue({
        code: 'custom',
        path: ['PATIENT_PROVIDER'],
        message:
          'o adapter HTTP de pacientes aguarda o contrato da API (docs/integrations/patients-api-checklist.md)',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (env.PATIENT_PROVIDER === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: ['PATIENT_PROVIDER'],
          message: 'o provider mock é proibido em produção',
        });
      }
      if (env.RECAPTCHA_SECRET_KEY === GOOGLE_TEST_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['RECAPTCHA_SECRET_KEY'],
          message: 'a chave de teste do reCAPTCHA é proibida em produção',
        });
      }
      if (env.RECAPTCHA_EXPECTED_HOSTNAMES.includes('testkey.google.com')) {
        ctx.addIssue({
          code: 'custom',
          path: ['RECAPTCHA_EXPECTED_HOSTNAMES'],
          message: 'testkey.google.com é proibido em produção',
        });
      }
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'cookies devem ser Secure em produção',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Valida o ambiente. A mensagem de erro lista apenas nomes de variáveis e o motivo,
 * nunca os valores (que podem ser segredos).
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${details}`);
  }
  return result.data;
}
