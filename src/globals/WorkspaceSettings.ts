import type { GlobalConfig } from 'payload'
import { isAdmin, isAuthenticated } from '@/access/roles'

export const WorkspaceSettings: GlobalConfig = {
  slug: 'workspace-settings',
  label: 'Paramètres du Workspace',
  admin: {
    description:
      'Configurer la visibilité des onglets et le modèle IA global utilisé dans le workspace. L’onglet Inspecteur JSON reste toujours désactivé.',
  },
  access: {
    read: isAuthenticated,
    update: isAdmin,
  },
  fields: [
    {
      name: 'defaultAiModel',
      type: 'relationship',
      relationTo: 'ai-models',
      label: 'Modèle IA global par défaut',
      admin: {
        description:
          'Modèle IA utilisé globalement pour toutes les analyses PLU (si non défini, le modèle marqué par défaut dans AI Models est utilisé).',
      },
    },
    {
      name: 'tabs',
      type: 'group',
      label: 'Onglets du Workspace',
      fields: [
        {
          name: 'showRegulations',
          type: 'checkbox',
          defaultValue: true,
          label: 'Afficher l’onglet Réglementation',
        },
        {
          name: 'showCadastralInfo',
          type: 'checkbox',
          defaultValue: true,
          label: 'Afficher l’onglet Informations Cadastral',
        },
        {
          name: 'showFeasibility',
          type: 'checkbox',
          defaultValue: false,
          label: 'Afficher l’onglet Faisabilité',
        },
        {
          name: 'showHistory',
          type: 'checkbox',
          defaultValue: true,
          label: 'Afficher l’onglet Historique',
        },
        {
          name: 'showCompare',
          type: 'checkbox',
          defaultValue: false,
          label: 'Afficher l’onglet Comparaison',
        },
        {
          name: 'showSettings',
          type: 'checkbox',
          defaultValue: true,
          label: 'Afficher l’onglet Paramètres',
        },
      ],
    },
  ],
}
