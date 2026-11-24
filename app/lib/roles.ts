import { Role } from '~/generated/prisma/enums';

/** From the most to the least rights, as in the schema. */
export const ROLES = Object.values(Role);

export function hasRole(role: Role, minRole: Role) {
  return ROLES.indexOf(role) <= ROLES.indexOf(minRole);
}
