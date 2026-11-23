import { data } from 'react-router';
import { z } from 'zod';
import type { Sex } from '~/generated/prisma/client';
import { DomainError } from '~/lib/errors';

/** Rankings in URLs look like "FEMALE:K5". */
export function parseRankingGroup(value: string): { sex: Sex; category: string } {
  const match = /^(FEMALE|MALE):(.+)$/.exec(value);
  if (!match) throw data(null, 400);
  return { sex: match[1] as Sex, category: match[2] };
}

export function parseGround(value: string): number {
  const result = z.coerce.number().int().min(1).safeParse(value);
  if (!result.success) throw data(null, 400);
  return result.data;
}

/** Ids of other competitions, and everything else that is not there, become a 404. */
export async function orNotFound<Result>(promise: Promise<Result>): Promise<Result> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof DomainError) throw data(null, 404);
    throw error;
  }
}
