import { z } from 'zod';
import type { ServerT } from '~/locales';
import { SEXES, type Sex } from '~/modules/types';

/** The details of a competition as sent by a form. */
export function competitionSchema(t: ServerT) {
  const text = z
    .string()
    .trim()
    .min(1, t('errors.required'))
    .max(200, t('competition:errors.tooLong'));
  // Plain days are stored at midnight UTC.
  const date = z.iso
    .date({ error: t('errors.required'), abort: true })
    .transform((value) => new Date(value));
  const grounds = t('competition:errors.grounds');

  return z
    .object({
      name: text,
      location: text,
      startDate: date,
      endDate: date,
      grounds: z.coerce.number(grounds).int(grounds).min(1, grounds).max(20, grounds),
      sexes: z
        .enum([...SEXES, 'BOTH'])
        .transform((value): Sex[] => (value === 'BOTH' ? [...SEXES] : [value]))
        .optional(),
    })
    .refine(({ startDate, endDate }) => startDate <= endDate, {
      path: ['endDate'],
      message: t('competition:errors.endDate'),
    });
}

/** The uploaded logo, null when no file was chosen. */
export async function readLogo(formData: FormData) {
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return null;
  return new Uint8Array(await file.arrayBuffer());
}

/** Undefined when it is not JSON. */
export function parseJson(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    return undefined;
  }
}
