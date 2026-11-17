import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, isPlannerOrAdmin } from '@/access/roles'

export const Parcels: CollectionConfig = {
  slug: 'parcels',
  admin: {
    useAsTitle: 'idu',
    group: 'Cadastre & GIS',
    defaultColumns: ['idu', 'commune', 'section', 'numero', 'surfaceM2', 'updatedAt'],
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: isPlannerOrAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'idu',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Identifiant Parcellaire (IDU)',
    },
    {
      name: 'codeInsee',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'commune',
      type: 'text',
    },
    {
      name: 'section',
      type: 'text',
      required: true,
    },
    {
      name: 'numero',
      type: 'text',
      required: true,
    },
    {
      name: 'prefixe',
      type: 'text',
      defaultValue: '000',
    },
    {
      name: 'surfaceM2',
      type: 'number',
      label: 'Surface cadastrale (m²)',
    },
    {
      name: 'address',
      type: 'text',
    },
    {
      name: 'centroid',
      type: 'group',
      fields: [
        { name: 'lng', type: 'number' },
        { name: 'lat', type: 'number' },
      ],
    },
    {
      name: 'geometry',
      type: 'json',
      label: 'GeoJSON Geometry',
    },
    {
      name: 'rawCadastre',
      type: 'json',
      label: 'Raw IGN Cadastre Feature',
    },
    {
      name: 'source',
      type: 'text',
      defaultValue: 'IGN API Carto Cadastre',
    },
  ],
}
