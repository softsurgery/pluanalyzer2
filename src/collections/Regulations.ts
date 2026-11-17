import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, isPlannerOrAdmin } from '@/access/roles'

export const Regulations: CollectionConfig = {
  slug: 'regulations',
  admin: {
    useAsTitle: 'title',
    group: 'Regulatory Knowledge',
    defaultColumns: ['zoneCode', 'articleNumber', 'title', 'commune', 'sourceType', 'updatedAt'],
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
      name: 'zoneCode',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'zoneLabel',
      type: 'text',
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
      name: 'articleNumber',
      type: 'text',
      required: true,
    },
    {
      name: 'rawText',
      type: 'textarea',
      required: true,
    },
    {
      name: 'sourceType',
      type: 'select',
      defaultValue: 'pdf_extraction',
      options: [
        { label: 'PDF Extraction', value: 'pdf_extraction' },
        { label: 'GPU Official', value: 'gpu' },
        { label: 'Métropole AMP ArcGIS', value: 'amp_arcgis' },
        { label: 'Manual Entry', value: 'manual' },
      ],
    },
    {
      name: 'sourceDocument',
      type: 'relationship',
      relationTo: 'documents',
    },
    {
      name: 'structuredRules',
      type: 'group',
      label: 'Structured Urban-Planning Parameters',
      fields: [
        { name: 'maxHeightM', type: 'number', label: 'Hauteur max (m)' },
        { name: 'maxEavesHeightM', type: 'number', label: 'Hauteur à l\'égout (m)' },
        { name: 'maxStoreys', type: 'number', label: 'Niveaux max (R+N)' },
        { name: 'maxCoverageRatio', type: 'number', label: 'Emprise au sol max (0..1)' },
        { name: 'frontSetbackM', type: 'number', label: 'Recul voirie (m)' },
        { name: 'sideSetbackM', type: 'number', label: 'Recul limites séparatives (m)' },
        { name: 'rearSetbackM', type: 'number', label: 'Recul fond de parcelle (m)' },
        { name: 'minGreenRatio', type: 'number', label: 'Pleine terre min (0..1)' },
        { name: 'parkingPerDwelling', type: 'number', label: 'Places stationnement / logement' },
      ],
    },
  ],
}
