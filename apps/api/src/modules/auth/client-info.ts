import type { Request } from 'express';
import type { SessionClientInfo } from './session.service.js';

export function clientInfo(req: Request): SessionClientInfo {
  const userAgent = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined };
}
