import type { CollectionConfig } from "payload";
import { isAdmin, isAuthenticated } from "@/access/roles";

export const AIModels: CollectionConfig = {
  slug: "ai-models",
  admin: {
    useAsTitle: "model",
    defaultColumns: ["model", "label", "isDefault", "isActive", "updatedAt"],
  },
  access: {
    read: isAuthenticated,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.isDefault) {
          data.isActive = true;
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        if (!doc?.isDefault) return doc;

        const others = await req.payload.find({
          collection: "ai-models",
          where: {
            and: [
              { id: { not_equals: doc.id } },
              { isDefault: { equals: true } },
            ],
          },
          limit: 100,
          req,
        });

        for (const other of others.docs) {
          await req.payload.update({
            collection: "ai-models",
            id: other.id,
            data: { isDefault: false },
            req,
          });
        }

        return doc;
      },
    ],
  },
  fields: [
    {
      name: "model",
      type: "text",
      required: true,
      unique: true,
      label: "Model Identifier",
      admin: {
        placeholder: "nvidia/nemotron-3-ultra-550b-a55b:free",
        description:
          "Exact OpenRouter model slug, e.g. nvidia/nemotron-3-ultra-550b-a55b:free",
      },
    },
    {
      name: "label",
      type: "text",
      label: "Display Name",
      admin: {
        placeholder: "NVIDIA Nemotron 3 Ultra 550B (Free)",
        description: "Optional friendly name shown in the analysis selector.",
      },
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      label: "System Default Model",
      admin: {
        description:
          "Set as the default OpenRouter model for analyses when no model is explicitly chosen.",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      label: "Active",
      admin: {
        description:
          "Only active models are selectable by users during analysis.",
      },
    },
    {
      name: "description",
      type: "textarea",
      label: "Notes / Description",
    },
  ],
};
