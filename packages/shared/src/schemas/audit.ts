import { z } from 'zod';
import type { AuditResult, Role } from '../enums.js';
import { paginationSchema } from './pagination.js';

export const listAuditLogsQuerySchema = paginationSchema.extend({
  action: z.string().max(80).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(128).optional(),
  actorUserId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export interface AuditLogView {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  storeId: string | null;
  result: AuditResult;
  metadata: unknown;
  ipAddress: string | null;
  correlationId: string | null;
}
