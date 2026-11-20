import type { GlobalConfig } from "payload";
import { isAdmin, isAuthenticated } from "@/access/roles";

export const WorkspaceSettings: GlobalConfig = {
  slug: "workspace-settings",
  label: "Paramètres du Workspace",
  admin: {
    description:
      "Configurer la visibilité des onglets et le modèle IA global utilisé dans le workspace. L’onglet Inspecteur JSON reste toujours désactivé.",
  },
  access: {
    read: isAuthenticated,
    update: isAdmin,
  },
  fields: [
    {
      name: "defaultAiModel",
      type: "relationship",
      relationTo: "ai-models",
      label: "Modèle IA global par défaut",
      admin: {
        description:
          "Modèle IA utilisé globalement pour toutes les analyses PLU (si non défini, le modèle marqué par défaut dans AI Models est utilisé).",
      },
    },
    {
      name: "maxPdfCharsToAi",
      type: "number",
      defaultValue: 90000,
      min: 5000,
      max: 500000,
      label: "Taille max du contenu PDF envoyé à l’IA (caractères)",
      admin: {
        description:
          "Nombre maximal de caractères extraits des documents PDF envoyés au modèle IA (défaut : 90 000).",
      },
    },
    {
      name: "maxPdfArticlesToAi",
      type: "number",
      defaultValue: 40,
      min: 5,
      max: 100,
      label: "Nombre max d’articles PDF envoyés à l’IA",
      admin: {
        description:
          "Nombre maximal d’articles pertinents sélectionnés et envoyés à l’IA par analyse (défaut : 40).",
      },
    },
    {
      name: "model-details",
      type: "ui",
      admin: {
        components: {
          Field: "@/components/admin/model-details/ModelDetails#ModelDetails",
        },
      },
    },
    {
      name: "tabs",
      type: "group",
      label: "Onglets du Workspace",
      fields: [
        {
          name: "showRegulations",
          type: "checkbox",
          defaultValue: true,
          label: "Afficher l’onglet Réglementation",
        },
        {
          name: "showCadastralInfo",
          type: "checkbox",
          defaultValue: true,
          label: "Afficher l’onglet Informations Cadastral",
        },
        {
          name: "showFeasibility",
          type: "checkbox",
          defaultValue: false,
          label: "Afficher l’onglet Faisabilité",
        },
        {
          name: "showHistory",
          type: "checkbox",
          defaultValue: true,
          label: "Afficher l’onglet Historique",
        },
        {
          name: "showCompare",
          type: "checkbox",
          defaultValue: false,
          label: "Afficher l’onglet Comparaison",
        },
        {
          name: "showSettings",
          type: "checkbox",
          defaultValue: true,
          label: "Afficher l’onglet Paramètres",
        },
      ],
    },
  ],
};
