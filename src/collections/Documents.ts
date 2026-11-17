import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, isPlannerOrAdmin } from '@/access/roles'

export const Documents: CollectionConfig = {
  slug: 'documents',
  upload: {
    staticDir: 'uploads/documents',
    mimeTypes: ['application/pdf', 'text/plain', 'application/json'],
  },
  admin: {
    useAsTitle: 'title',
    group: 'Regulatory Knowledge',
    defaultColumns: ['title', 'documentType', 'commune', 'zoneCode', 'extractionStatus', 'updatedAt'],
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
      name: 'documentType',
      type: 'select',
      required: true,
      defaultValue: 'reglement',
      options: [
        { label: 'Règlement écrit PLU/PLUi', value: 'reglement' },
        { label: 'OAP (Orientations d\'Aménagement)', value: 'oap' },
        { label: 'Annexe / Servitude (SUP)', value: 'annexe' },
        { label: 'Plan de zonage', value: 'zonage' },
        { label: 'Rapport de présentation', value: 'rapport' },
        { label: 'Export / Rapport d\'étude', value: 'export' },
      ],
    },
    {
      name: 'commune',
      type: 'text',
    },
    {
      name: 'codeInsee',
      type: 'text',
      index: true,
    },
    {
      name: 'zoneCode',
      type: 'text',
      index: true,
    },
    {
      name: 'sourceUrl',
      type: 'text',
      label: 'GPU / ArcGIS Source URL',
    },
    {
      name: 'gpuDocumentId',
      type: 'text',
    },
    {
      name: 'pageCount',
      type: 'number',
    },
    {
      name: 'extractionStatus',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Extracted (Text)', value: 'extracted' },
        { label: 'OCR Required / Scanned', value: 'ocr_required' },
        { label: 'OCR Completed', value: 'ocr_completed' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'extractedText',
      type: 'textarea',
      label: 'Extracted Regulatory Text',
    },
    {
      name: 'extractionMetadata',
      type: 'json',
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
    },
  ],
}
