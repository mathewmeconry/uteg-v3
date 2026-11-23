import { z } from 'zod';
import { DomainError } from './errors';
import type { GradeReply, GradeRequest } from './gradeRequests';
import { saveGrades, type GradeScope } from './judging.server';

const requestIdSchema = z.string().regex(/^\w{1,64}$/);

const schema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('save'),
    // PostgreSQL rejects NUL.
    entryId: z.string().regex(/^\w+$/),
    apparatus: z.string(),
    grade: z.object({ value: z.number(), attempts: z.array(z.number()) }),
    previous: z.object({ id: z.string(), version: z.number() }).nullable(),
    requestId: requestIdSchema,
    supersedes: z.array(requestIdSchema).max(100),
  }),
  z.object({
    intent: z.literal('confirm'),
    round: z.number().int(),
    divisionIds: z.array(z.string().regex(/^\w+$/)),
  }),
]) satisfies z.ZodType<GradeRequest>;

type Confirmation = Extract<GradeRequest, { intent: 'confirm' }>;

/**
 * Answers the requests of the tablets and the grading tables. Domain errors become a reply, because
 * an error page would replace the typed grades.
 */
export async function handleGradeRequest(
  request: Request,
  competitionId: string,
  scope: GradeScope,
  confirm: (body: Confirmation) => Promise<unknown>,
): Promise<Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, code: 'INVALID_INPUT' }, 400);
  const body = parsed.data;
  try {
    if (body.intent === 'confirm') {
      await confirm(body);
      return reply({ ok: true, savedAt: Date.now() });
    }
    const { entryId, apparatus, grade, previous, requestId, supersedes } = body;
    const input = { entryId, apparatus, ...grade, previous, requestId, supersedes };
    const [saved] = await saveGrades(competitionId, [input], scope);
    return reply({ ok: true, savedAt: Date.now(), grade: saved });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return reply({ ok: false, code: error.code, ...error.details }, 400);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function reply(body: GradeReply, status = 200) {
  return Response.json(body, { status });
}
