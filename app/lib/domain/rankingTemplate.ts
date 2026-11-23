import { z } from 'zod';

export const MAX_FOOTER_LINES = 5;

/** PostgreSQL rejects NUL. */
const text = z.string().regex(/^[^\0]*$/);

/** How a ranking PDF looks. Text fields may contain placeholders such as {category}. */
export const rankingTemplateSchema = z.object({
  title: text.max(200).default('{competition}'),
  subtitle: text.max(200).default('{category} {sex}'),
  footer: text
    .max(500)
    .refine((footer) => footer.split('\n').length <= MAX_FOOTER_LINES)
    .default(''),
  showLogo: z.boolean().default(true),
  logoPosition: z.enum(['left', 'center', 'right']).default('right'),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#1d4ed8'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  columns: z
    .object({
      firstname: z.boolean().default(true),
      lastname: z.boolean().default(true),
      club: z.boolean().default(true),
      location: z.boolean().default(false),
      birthYear: z.boolean().default(true),
      apparatus: z.boolean().default(true),
      total: z.boolean().default(true),
      award: z.boolean().default(true),
    })
    .prefault({}),
  nameFormat: z.enum(['firstLast', 'lastFirst', 'separate']).default('firstLast'),
  /** At least, a contest with precision 3 is always printed with 3. */
  decimals: z.union([z.literal(2), z.literal(3)]).default(2),
  medalStyle: z.enum(['letters', 'icons', 'none']).default('letters'),
  highlightBest: z.boolean().default(true),
  showPageNumbers: z.boolean().default(true),
  showDate: z.boolean().default(true),
  /** One signature line per label. */
  signatureLabels: z.array(text.trim().min(1).max(100)).max(4).default([]),
  fontSize: z.number().min(6).max(16).default(9),
  rowHeight: z.number().min(10).max(40).default(18),
  onlyAwarded: z.boolean().default(false),
  /** Above each table. Empty: none, unless categories share pages and need one. */
  groupHeading: text.max(200).default(''),
  newPagePerCategory: z.boolean().default(true),
});

export type RankingTemplateOptions = z.infer<typeof rankingTemplateSchema>;

export const defaultRankingTemplate = rankingTemplateSchema.parse({});

/** Stored options. Those that are no longer valid get their default, so they can be repaired. */
export function parseStoredTemplate(stored: unknown): RankingTemplateOptions {
  const result = rankingTemplateSchema.safeParse(stored);
  if (result.success) return result.data;
  const invalid = new Set(result.error.issues.map(({ path }) => path[0]));
  const entries = stored && typeof stored === 'object' ? Object.entries(stored) : [];
  return rankingTemplateSchema.parse(
    Object.fromEntries(entries.filter(([key]) => !invalid.has(key))),
  );
}

export const PLACEHOLDERS = ['category', 'sex', 'competition', 'location', 'date'] as const;

/** Replaces placeholders such as {category}. Unknown ones stay as they are. */
export function fillPlaceholders(
  pattern: string,
  values: Record<(typeof PLACEHOLDERS)[number], string>,
) {
  return pattern.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? values[name as keyof typeof values] : match,
  );
}
