import { z } from 'zod';

/** E-mail normalizado (trim + minúsculas), com limite de tamanho (RFC 5321). */
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email('E-mail inválido.'))
  .transform((value) => value.toLowerCase());

export const uuidSchema = z.uuid();
