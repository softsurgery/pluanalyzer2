import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, isPlannerOrAdmin } from '@/access/roles'

export const GISData: CollectionConfig = {
  slug: 'gis-data',
  admin: {
    useAsTitle: 'layerName',
    group: 'Cadastre & GIS',
    defaultColumns: ['provider', 'layerName', 'zoneCode', 'commune', 'retrievedAt'],
  },
  access: {
    read: isAuthenticated,
    create: isPlannerOrAdmin,
    update: isPlannerOrAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'provider',
      type: 'select',
      required: true,
      options: [
        { label: 'IGN API Carto GPU', value: 'ign_apicarto_gpu' },
        { label: 'IGN API Carto Cadastre', value: 'ign_apicarto_cadastre' },
        { label: 'Métropole AMP ArcGIS', value: 'amp_arcgis' },
        { label: 'Géoportail Urbanisme (GPU)', value: 'gpu_api' },
        { label: 'IGN Géoplateforme Geocoding', value: 'ign_geocoding' },
      ],
    },
    {
      name: 'layerName',
      type: 'text',
      required: true,
    },
    {
      name: 'parcel',
      type: 'relationship',
      relationTo: 'parcels',
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
      name: 'zoneType',
      type: 'text',
    },
    {
      name: 'prescriptions',
      type: 'json',
      label: 'Prescriptions & Servitudes (GeoJSON / Attributes)',
    },
    {
      name: 'rawResponse',
      type: 'json',
      required: true,
      label: 'Raw External GIS Response',
    },
    {
      name: 'retrievedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
  ],
}
