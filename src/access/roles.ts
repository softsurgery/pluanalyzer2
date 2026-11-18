import type { Access, FieldAccess } from 'payload'

export type UserRole = 'admin' | 'urban_planner' | 'analyst' | 'viewer'

export interface AuthUser {
  id: string | number
  email?: string
  role?: UserRole
  fullName?: string
  organization?: string
  territoryFocus?: string
}

export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

export const isAdmin: Access = ({ req: { user } }) => {
  return (user as AuthUser | null)?.role === 'admin'
}

export const isPlannerOrAdmin: Access = ({ req: { user } }) => {
  const role = (user as AuthUser | null)?.role
  return role === 'admin' || role === 'urban_planner' || role === 'analyst'
}

export const isAdminField: FieldAccess = ({ req: { user } }) => {
  return (user as AuthUser | null)?.role === 'admin'
}

export const isOwnerOrPlannerOrAdmin: Access = ({ req: { user } }) => {
  const authUser = user as AuthUser | null
  if (!authUser) return false
  if (authUser.role === 'admin' || authUser.role === 'urban_planner') return true
  return {
    owner: {
      equals: authUser.id,
    },
  }
}

export const neverUpdate: Access = () => false
export const neverDelete: Access = () => false
