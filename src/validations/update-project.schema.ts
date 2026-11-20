import { z } from "zod";

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Le titre du projet est requis."),
});
