import type { Role } from '@prisma/client';

export function canManageUsers(role: Role) {
  return role === 'ADMIN';
}

export function canDeleteBranch(role: Role) {
  return role === 'ADMIN';
}

export function canRunAutomation(role: Role) {
  return role === 'ADMIN' || role === 'MANAGER';
}
