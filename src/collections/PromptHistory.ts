import type { CollectionConfig } from 'payload'
import { isAuthenticated, isPlannerOrAdmin, neverDelete, neverUpdate } from '@/access/roles'

/**
 * Immutable prompt history timeline.
 * Every submitted prompt creates a new versioned entry linked to its snapshot and execution.
 */
export const PromptHistory: CollectionConfig = {
  slug: 'prompt-history',
  admin: {
    useAsTitle: 'promptPreview',
    group: 'Analysis History',
    defaultColumns: ['promptPreview', 'version', 'project', 'analysis', 'createdBy', 'createdAt'],
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: neverUpdate,
    delete: neverDelete,
  },
  fields: [
    {
      name: 'promptPreview',
      type: 'text',
      required: true,
    },
    {
      name: 'promptText',
      type: 'textarea',
      required: true,
    },
    {
      name: 'submittedPayload',
      type: 'json',
      required: true,
    },
    {
      name: 'version',
      type: 'number',
      required: true,
    },
    {
      name: 'isReplay',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      index: true,
    },
    {
      name: 'analysis',
      type: 'relationship',
      relationTo: 'analyses',
      required: true,
      index: true,
    },
    {
      name: 'snapshot',
      type: 'relationship',
      relationTo: 'analysis-snapshots',
      required: true,
    },
    {
      name: 'execution',
      type: 'relationship',
      relationTo: 'executions',
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
  ],
}
