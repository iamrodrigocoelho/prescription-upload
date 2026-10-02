import type { Env } from '../../config/env.js';

export const ATTACHMENTS_QUEUE = 'attachments';
export const PROCESS_SUBMISSION_JOB = 'process-submission';

export interface ProcessSubmissionJob {
  submissionId: string;
}

/** Retry com backoff exponencial; jobs concluídos ficam 24 h para deduplicar. */
export const ATTACHMENT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** BullMQ não aceita ':' em jobId; um job por receita (idempotência). */
export function submissionJobId(submissionId: string): string {
  return `submission-${submissionId}`;
}

export function bullPrefix(env: Pick<Env, 'REDIS_KEY_PREFIX'>): string {
  return `${env.REDIS_KEY_PREFIX}bull`;
}
