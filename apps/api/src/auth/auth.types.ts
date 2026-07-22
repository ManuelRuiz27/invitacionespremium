import type { UserRole } from '../generated/prisma/client';
import type { RequestWithOperationId } from '../common/logging/request-context';

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  email: string;
  role: UserRole;
  clientId: string | null;
}

export interface AuthenticatedRequest extends RequestWithOperationId {
  auth?: AuthPrincipal;
}
