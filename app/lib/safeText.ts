import { z } from 'zod';

/** A string PostgreSQL can store: it knows no NUL. */
export function safeText(message?: string) {
  return z.string().refine((text) => !text.includes('\0'), message);
}

export function hasNul(formData: FormData) {
  return [...formData.values()].some((value) => String(value).includes('\0'));
}
