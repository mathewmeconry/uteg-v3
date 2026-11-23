import { data } from 'react-router';
import type { z } from 'zod';

export type FieldErrors = Record<string, string>;

/** A form without files. Browsers never send other content types or NUL in it. */
export async function readForm(request: Request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    throw data(null, 400);
  }
  for (const value of formData.values()) {
    if (typeof value !== 'string' || value.includes('\0')) throw data(null, 400);
  }
  return formData;
}

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
  const values = Object.fromEntries(formData);
  // Browsers never send NUL, and PostgreSQL rejects it.
  if (Object.values(values).some((value) => typeof value === 'string' && value.includes('\0'))) {
    throw data(null, 400);
  }
  const result = schema.safeParse(values);
  return result.success ? { data: result.data } : { errors: fieldErrors(result.error) };
}
