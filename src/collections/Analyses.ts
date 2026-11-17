import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, isPlannerOrAdmin } from '@/access/roles'

export const Analyses: CollectionConfig = {
  slug: 'analyses',
  admin: {
    useAsTitle: 'title',
    group: 'Feasibility Studies',
    defaultColumns: ['title', 'project', 'parcel', 'currentVersion', 'status', 'updatedAt'],
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: isPlannerOrAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      index: true,
    },
    {
      name: 'parcel',
      type: 'relationship',
      relationTo: 'parcels',
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'completed',
      options: [
        { label: 'Running', value: 'running' },
        { label: 'Completed', value: 'completed' },
        { label: 'Partial', value: 'partial' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'currentVersion',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'latestSnapshot',
      type: 'relationship',
      relationTo: 'analysis-snapshots',
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
  ],
}
