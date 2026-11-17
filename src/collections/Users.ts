import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminField, isAuthenticated } from '@/access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7, // 7 days
    useAPIKey: true,
  },
  admin: {
    useAsTitle: 'email',
    group: 'Administration',
    defaultColumns: ['email', 'fullName', 'role', 'organization', 'updatedAt'],
  },
  access: {
    read: isAuthenticated,
    create: isAdmin,
    update: ({ req: { user }, id }) => {
      if (!user) return false
      if ((user as { role?: string }).role === 'admin') return true
      return user.id === id
    },
    delete: isAdmin,
  },
  fields: [
    {
      name: 'fullName',
      type: 'text',
      required: true,
      label: 'Full Name',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'urban_planner',
      saveToJWT: true,
      access: {
        update: isAdminField,
      },
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Urban Planner', value: 'urban_planner' },
        { label: 'GIS / PLU Analyst', value: 'analyst' },
        { label: 'Viewer (Read Only)', value: 'viewer' },
      ],
    },
    {
      name: 'organization',
      type: 'text',
      defaultValue: 'Métropole Aix-Marseille-Provence',
    },
    {
      name: 'territoryFocus',
      type: 'text',
      defaultValue: 'Aix-Marseille-Provence',
    },
  ],
}
