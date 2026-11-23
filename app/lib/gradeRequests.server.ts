import { z } from 'zod';
import { DomainError } from './errors';
import type { GradeReply, GradeRequest } from './gradeRequests';

const storedGradeSchema = z.object({ value: z.number(), attempts: z.array(z.number()) });

const schema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('save'),
    entryId: z.string(),
    apparatus: z.string(),
    grade: storedGradeSchema,
    previous: storedGradeSchema.nullable(),
  }),
  z.object({
    intent: z.literal('confirm'),
    round: z.number().int(),
    divisionIds: z.array(z.string()),
  }),
]) satisfies z.ZodType<GradeRequest>;

/**
 * Answers the requests of the tablets and the grading tables. Domain errors become a reply, because
 * an error page would replace the typed grades.
 */
export async function handleGradeRequest(
  request: Request,
  handle: (body: GradeRequest) => Promise<unknown>,
): Promise<Response> {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return reply({ ok: false, code: 'INVALID_INPUT' }, 400);
  try {
    await handle(body.data);
    return reply({ ok: true, savedAt: Date.now() });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return reply({ ok: false, code: error.code, ...error.details }, 400);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function reply(body: GradeReply, status = 200) {
  return Response.json(body, { status });
}
