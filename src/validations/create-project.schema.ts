import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Le nom du projet est requis."),
  commune: z.string().trim().min(1, "La commune est requise."),
  codeInsee: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Le code INSEE doit contenir 5 chiffres."),
  territory: z.enum(["amp", "gpu"]),
});
