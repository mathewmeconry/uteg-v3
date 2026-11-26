import { Role } from '~/generated/prisma/enums';

/** From the most to the least rights, as in the schema. */
export const ROLES = Object.values(Role);

/**
 * What a member may do. Code asks for permissions, never for roles, so that a role is one line here.
 * - view: sees every page, changes nothing
 * - edit: changes the competition, its starters, divisions and grades
 * - manage: manages the members and deletes the competition
 * - checkIn: adds starters, changes their personal data and removes them
 */
const PERMISSIONS = {
  OWNER: ['view', 'edit', 'manage', 'checkIn'],
  EDITOR: ['view', 'edit', 'checkIn'],
  VIEWER: ['view'],
  CHECK_IN: ['checkIn'],
} as const satisfies Record<Role, readonly string[]>;

export type Permission = (typeof PERMISSIONS)[Role][number];

export function can(role: Role, permission: Permission) {
  return (PERMISSIONS[role] as readonly Permission[]).includes(permission);
}
