import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, isPlannerOrAdmin } from '@/access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'uploads/media',
    mimeTypes: ['application/pdf', 'text/plain', 'application/json', 'image/*'],
  },
  admin: {
    useAsTitle: 'filename',
    group: 'Regulatory Knowledge',
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: isPlannerOrAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
