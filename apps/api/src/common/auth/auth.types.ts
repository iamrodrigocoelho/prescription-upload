import type { Role } from '@receita/shared';
import type { Request } from 'express';
import type { SessionState } from '../../generated/prisma/client.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  totpEnabled: boolean;
  totpRequired: boolean;
}

export interface AuthContext {
  sessionId: string;
  sessionState: SessionState;
  user: AuthenticatedUser;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };
