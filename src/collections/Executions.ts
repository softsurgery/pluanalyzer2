import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, isPlannerOrAdmin } from '@/access/roles'

export const Executions: CollectionConfig = {
  slug: 'executions',
  admin: {
    useAsTitle: 'executionCode',
    group: 'Analysis History',
    defaultColumns: ['executionCode', 'status', 'durationMs', 'startedAt', 'completedAt'],
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: isPlannerOrAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'executionCode',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Running', value: 'running' },
        { label: 'Completed', value: 'completed' },
        { label: 'Partial (Warnings)', value: 'partial' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'analysis',
      type: 'relationship',
      relationTo: 'analyses',
    },
    {
      name: 'startedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'completedAt',
      type: 'date',
    },
    {
      name: 'durationMs',
      type: 'number',
    },
    {
      name: 'steps',
      type: 'json',
      label: 'Pipeline Step Execution Details',
    },
    {
      name: 'logs',
      type: 'json',
      label: 'Structured Execution Logs',
    },
    {
      name: 'errors',
      type: 'json',
      label: 'Execution Errors & External API Failures',
    },
    {
      name: 'triggeredBy',
      type: 'relationship',
      relationTo: 'users',
    },
  ],
}
