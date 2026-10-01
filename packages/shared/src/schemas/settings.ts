import { z } from 'zod';

/** Retenção mínima de 365 dias até nova decisão do Jurídico/DPO (PRD §22.3). */
export const RETENTION_MIN_DAYS = 365;

export const systemSettingsSchema = z
  .object({
    retention_days: z
      .number()
      .int()
      .min(RETENTION_MIN_DAYS, `A retenção mínima é de ${RETENTION_MIN_DAYS} dias.`)
      .max(3650),
    patient_link_default_expiry_days: z.number().int().min(1).max(90),
    patient_link_max_expiry_days: z.number().int().min(1).max(90),
  })
  .refine((s) => s.patient_link_default_expiry_days <= s.patient_link_max_expiry_days, {
    path: ['patient_link_default_expiry_days'],
    message: 'A validade padrão não pode exceder a validade máxima.',
  });

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export type SystemSettingKey = keyof SystemSettings;

export const updateSystemSettingsSchema = z
  .object({
    retention_days: z.number().int(),
    patient_link_default_expiry_days: z.number().int(),
    patient_link_max_expiry_days: z.number().int(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhuma alteração informada.' });

export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;
