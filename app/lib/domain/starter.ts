import { z } from 'zod';

/** PostgreSQL cannot store NUL. */
export function withoutNul(schema: z.ZodString) {
  return schema.refine((value) => !value.includes('\0'));
}

/** STV-IDs are optional, blank input means none. */
const stvIdSchema = withoutNul(z.string().trim().max(50))
  .nullish()
  .transform((value) => value || null);

const name = withoutNul(z.string().trim().min(1).max(100));

export const starterSchema = z.object({
  stvId: stvIdSchema,
  firstname: name,
  lastname: name,
  birthYear: z.number().int().min(1900).max(2100),
  sex: z.enum(['FEMALE', 'MALE']),
});

export type StarterInput = z.input<typeof starterSchema>;
export type StarterData = z.output<typeof starterSchema>;

/** For updates: undefined keeps the value, also of the STV-ID. */
export const starterUpdateSchema = starterSchema.partial().extend({
  stvId: withoutNul(z.string().trim().max(50))
    .nullable()
    .transform((value) => value || null)
    .optional(),
});

const PERSON_FIELDS = ['firstname', 'lastname', 'birthYear', 'sex'] as const;
export type Person = Pick<StarterData, (typeof PERSON_FIELDS)[number]>;

export function isSamePerson(a: Person, b: Person) {
  return PERSON_FIELDS.every((field) => a[field] === b[field]);
}
