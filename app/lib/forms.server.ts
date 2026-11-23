import { data } from 'react-router';
import type { z } from 'zod';

export type FieldErrors = Record<string, string>;

/** The first message per field, keyed by its path joined with dots. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

/** Validates a form whose fields appear once. Use schema.safeParse and fieldErrors for lists. */
export function parseForm<Schema extends z.ZodType>(
  formData: FormData,
  schema: Schema,
): { data: z.infer<Schema>; errors?: undefined } | { data?: undefined; errors: FieldErrors } {
  rejectNul(formData);
  const result = schema.safeParse(Object.fromEntries(formData));
  return result.success ? { data: result.data } : { errors: fieldErrors(result.error) };
}

/** Browsers never send NUL, and PostgreSQL rejects it. Part of parseForm. */
export function rejectNul(formData: FormData) {
  for (const value of formData.values()) {
    if (typeof value === 'string' && value.includes('\0')) throw data(null, 400);
  }
}
