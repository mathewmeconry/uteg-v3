import type { StoredGrade } from './domain/gradeInput';
import type { DomainErrorCode, MissingGrade } from './errors';

/** A grade as the server has it. */
export type SavedGrade = StoredGrade & { id: string; version: number; requestId: string | null };

export type GradeRequest =
  | {
      intent: 'save';
      entryId: string;
      apparatus: string;
      grade: StoredGrade;
      /** The saved grade the input is based on. */
      previous: { id: string; version: number } | null;
      /** The same when the request is sent again. */
      requestId: string;
      /** Earlier requests that were not answered. This one replaces them. */
      supersedes: string[];
    }
  | { intent: 'confirm'; round: number; divisionIds: string[] };

/** `savedAt` is server time. Data loaded later contains the change. */
export type GradeReply =
  | { ok: true; savedAt: number; grade?: SavedGrade }
  /** GRADES_MISSING tells which, also on other apparatus. */
  | { ok: false; code: DomainErrorCode; missing?: MissingGrade[] };

/** OFFLINE: not answered, it may or may not have been saved. GONE: no access any more. */
export type GradeResult = GradeReply | { ok: false; code: 'OFFLINE' | 'GONE'; missing?: undefined };

const TIMEOUT_MS = 8_000;

/** Never throws, so a lost connection cannot replace the page. */
export async function sendGradeRequest(url: string, body: GradeRequest): Promise<GradeResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // The page itself sends no referrer, but the server checks the origin.
      referrerPolicy: 'same-origin',
    });
    if (response.status === 403 || response.redirected) return { ok: false, code: 'GONE' };
    const reply = (await response.json()) as GradeReply;
    // Error pages of a proxy are not a reply.
    return typeof reply.ok === 'boolean' ? reply : { ok: false, code: 'OFFLINE' };
  } catch {
    return { ok: false, code: 'OFFLINE' };
  }
}

/** crypto.randomUUID only exists with https, tablets may use plain http in the gym. */
export function createRequestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
