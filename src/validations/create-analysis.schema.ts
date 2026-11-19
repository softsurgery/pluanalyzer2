import { z } from "zod";

export const createAnalysisSchema = z
  .object({
    projectId: z.string().trim().min(1, "Veuillez sélectionner un projet."),
    locationMode: z.enum(["address", "parcel", "map"]),
    address: z.string(),
    idu: z.string(),
    selectedParcelId: z.string(),
    pickedLocation: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .nullable(),
    aiModel: z.string().optional(),
    prompt: z.string().trim().min(1, "Le prompt d'analyse est requis."),
  })
  .superRefine((data, ctx) => {
    if (data.locationMode === "address" && !data.address.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Veuillez saisir une adresse.",
        path: ["address"],
      });
    }
    if (data.locationMode === "parcel" && !data.idu.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Veuillez saisir un IDU cadastral.",
        path: ["idu"],
      });
    }
    if (data.locationMode === "map" && !data.pickedLocation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Veuillez sélectionner un point sur la carte.",
        path: ["pickedLocation"],
      });
    }
  });
