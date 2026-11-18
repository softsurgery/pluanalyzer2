import type { CollectionConfig } from 'payload'
import { isAuthenticated, isPlannerOrAdmin, neverDelete, neverUpdate } from '@/access/roles'

/**
 * Immutable historical snapshot of a PLU analysis run.
 * Never overwritten or deleted: every new prompt or replay creates a new snapshot version.
 */
export const AnalysisSnapshots: CollectionConfig = {
  slug: 'analysis-snapshots',
  admin: {
    useAsTitle: 'snapshotLabel',
    group: 'Analysis History',
    defaultColumns: [
      'snapshotLabel',
      'analysis',
      'version',
      'zoneCode',
      'validationStatus',
      'createdAt',
    ],
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: neverUpdate,
    delete: neverDelete,
  },
  fields: [
    {
      name: 'snapshotLabel',
      type: 'text',
      required: true,
    },
    {
      name: 'analysis',
      type: 'relationship',
      relationTo: 'analyses',
      required: true,
      index: true,
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
    },
    {
      name: 'version',
      type: 'number',
      required: true,
      index: true,
    },
    {
      name: 'replayedFrom',
      type: 'relationship',
      relationTo: 'analysis-snapshots',
      label: 'Replayed From Snapshot',
    },
    {
      name: 'originalPrompt',
      type: 'textarea',
      required: true,
      label: 'Original User Prompt',
    },
    {
      name: 'submittedPayload',
      type: 'json',
      required: true,
      label: 'Submitted JSON Payload',
    },
    {
      name: 'addressQuery',
      type: 'text',
    },
    {
      name: 'cadastralReferences',
      type: 'json',
      label: 'Address & Cadastral References',
    },
    {
      name: 'geocodingResult',
      type: 'json',
    },
    {
      name: 'zoneCode',
      type: 'text',
      index: true,
    },
    {
      name: 'zoningAndGis',
      type: 'json',
      label: 'Zoning & GIS Information',
    },
    {
      name: 'gisRecords',
      type: 'relationship',
      relationTo: 'gis-data',
      hasMany: true,
    },
    {
      name: 'documents',
      type: 'relationship',
      relationTo: 'documents',
      hasMany: true,
    },
    {
      name: 'extractedArticles',
      type: 'json',
      label: 'PLU Documents & Extracted Articles',
    },
    {
      name: 'regulations',
      type: 'relationship',
      relationTo: 'regulations',
      hasMany: true,
    },
    {
      name: 'regulatoryInterpretation',
      type: 'json',
      label: 'OpenRouter / Structured Regulatory Interpretation',
    },
    {
      name: 'validationStatus',
      type: 'select',
      defaultValue: 'incomplete',
      options: [
        { label: 'Valid', value: 'valid' },
        { label: 'Warnings', value: 'warnings' },
        { label: 'Incomplete Official Data', value: 'incomplete' },
        { label: 'Invalid', value: 'invalid' },
      ],
    },
    {
      name: 'validationReport',
      type: 'json',
    },
    {
      name: 'constructibilityCalculations',
      type: 'json',
    },
    {
      name: 'archicadExport',
      type: 'json',
    },
    {
      name: 'aiResponses',
      type: 'json',
      label: 'Raw & Parsed AI Responses',
    },
    {
      name: 'execution',
      type: 'relationship',
      relationTo: 'executions',
    },
    {
      name: 'executionLogs',
      type: 'json',
    },
    {
      name: 'executionErrors',
      type: 'json',
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
  ],
}
