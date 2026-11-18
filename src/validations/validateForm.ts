import { z } from "zod";

export function validateForm<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: Record<string, string[]> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors = result.error.flatten().fieldErrors as Record<
    string,
    string[] | undefined
  >;
  const errors: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      errors[key] = messages;
    }
  }
  return { success: false, errors };
}
