import type { UserRole } from '@/access/roles'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  urban_planner: 'Urbaniste',
  analyst: 'Analyste SIG / PLU',
  viewer: 'Lecteur (lecture seule)',
}

export function getUserInitials(fullName?: string, email?: string): string {
  const source = fullName?.trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return source.slice(0, 2).toUpperCase()
  }
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }
  return 'U'
}

export function getRoleLabel(role?: UserRole): string {
  if (!role) return 'Utilisateur'
  return ROLE_LABELS[role] ?? role
}

export type IdentifiableUser = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
  pictureId?: number | null;
};

export function identifyUser(user?: IdentifiableUser | null) {
  if (!user) return "Inconnu";
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  return user.username || user.email || "Inconnu";
}

export function identifyUserAvatar(user?: IdentifiableUser | null) {
  if (!user) return "U";
  const first = user.firstName?.charAt(0);
  const last = user.lastName?.charAt(0);
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();
  return (user.username || user.email || "U").charAt(0).toUpperCase();
}
