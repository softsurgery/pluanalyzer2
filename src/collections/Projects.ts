import type { CollectionConfig } from 'payload'
import {
  isAuthenticated,
  isOwnerOrPlannerOrAdmin,
  isPlannerOrAdmin,
} from '@/access/roles'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: {
    useAsTitle: 'name',
    group: 'Feasibility Studies',
    defaultColumns: ['name', 'commune', 'codeInsee', 'status', 'updatedAt'],
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: isPlannerOrAdmin,
    delete: isOwnerOrPlannerOrAdmin,
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const { payload } = req
        await payload.delete({
          collection: 'prompt-history',
          where: { project: { equals: id } },
          overrideAccess: true,
          req,
        })
        await payload.delete({
          collection: 'analysis-snapshots',
          where: { project: { equals: id } },
          overrideAccess: true,
          req,
        })
        await payload.delete({
          collection: 'analyses',
          where: { project: { equals: id } },
          overrideAccess: true,
          req,
        })
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'territory',
      type: 'select',
      defaultValue: 'amp',
      options: [
        { label: 'Métropole Aix-Marseille-Provence (PLUi)', value: 'amp' },
        { label: 'National Géoportail de l\'Urbanisme (GPU)', value: 'gpu' },
      ],
    },
    {
      name: 'commune',
      type: 'text',
      required: true,
      defaultValue: 'Aix-en-Provence',
    },
    {
      name: 'codeInsee',
      type: 'text',
      required: true,
      defaultValue: '13001',
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Active Study', value: 'active' },
        { label: 'Validated', value: 'validated' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      hooks: {
        beforeChange: [
          ({ req, value }) => {
            if (!value && req.user) return req.user.id
            return value
          },
        ],
      },
    },
    {
      name: 'parcels',
      type: 'relationship',
      relationTo: 'parcels',
      hasMany: true,
    },
    {
      name: 'documents',
      type: 'relationship',
      relationTo: 'documents',
      hasMany: true,
    },
  ],
}
