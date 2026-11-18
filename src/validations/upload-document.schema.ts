import { z } from "zod";

export const uploadDocumentSchema = z.object({
  title: z.string().trim(),
  zoneCode: z.string().trim().min(1, "Le code zone est requis."),
  codeInsee: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Le code INSEE doit contenir 5 chiffres."),
  projectId: z.string().trim().min(1, "Veuillez sélectionner un projet."),
  file: z.custom<File>((val) => val instanceof File, {
    message: "Veuillez sélectionner un fichier PDF ou TXT.",
  }),
});
