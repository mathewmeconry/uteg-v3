import type { Role } from '~/generated/prisma/enums';

const ROLES: Role[] = ['CHECK_IN', 'VIEWER', 'EDITOR', 'OWNER'];

export function hasRole(role: Role, minRole: Role) {
  return ROLES.indexOf(role) >= ROLES.indexOf(minRole);
}
