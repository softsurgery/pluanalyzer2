import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Le nom complet est requis."),
  email: z.string().trim().email("Adresse email invalide."),
  organization: z.string().trim(),
  territoryFocus: z.string().trim(),
});
