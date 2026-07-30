import type { UserRole } from '@invitaciones/api-client';

export const financeRoles: UserRole[] = ['INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN'];

export const roleLabels: Record<UserRole, string> = {
  PLATFORM_ADMIN: 'Platform Admin',
  INDEPENDENT_PLANNER: 'Planner independiente',
  ORGANIZATION_ADMIN: 'Admin de Organización',
  ORGANIZATION_PLANNER: 'Planner de Organización'
};

export function canViewFinance(role: UserRole): boolean {
  return financeRoles.includes(role);
}
