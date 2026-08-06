/**
 * Permission model.
 *
 * Two axes, deliberately kept separate:
 *
 *   1. *Capability* — what a user may do (these keys).
 *   2. *Scope* — which ingests they may do it to (the ingest_access table).
 *
 * Holding `output.manage` does not let an operator re-transmit an ingest they
 * were never granted; it lets them re-transmit the ones they were. Admins
 * bypass both axes.
 */
export const PERMISSIONS = {
  'ingest.create': 'Criar uma nova recepção',
  'ingest.configure': 'Configurar uma recepção',
  'ingest.monitor': 'Monitorar uma recepção',
  'output.manage': 'Retransmitir com novos parâmetros',
  'output.omt': 'Transmitir por OMT',
  'ingest.viewAll': 'Ver todo o tráfego (multiview)',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

export type Role = 'admin' | 'operator';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  permissions: Permission[];
  enabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Admins hold every capability implicitly — never store that in their row. */
export function effectivePermissions(user: Pick<User, 'role' | 'permissions'>): Permission[] {
  return user.role === 'admin' ? [...ALL_PERMISSIONS] : user.permissions;
}

export function can(user: Pick<User, 'role' | 'permissions'>, permission: Permission): boolean {
  if (user.role === 'admin') return true;
  return user.permissions.includes(permission);
}

/** Only admins manage users, presets and platform settings. */
export function isAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === 'admin';
}
