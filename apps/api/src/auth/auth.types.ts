import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/client';

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  email: string;
  role: UserRole;
  clientId: string | null;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
}
