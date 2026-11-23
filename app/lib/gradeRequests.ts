import type { StoredGrade } from './domain/gradeInput';
import type { DomainErrorCode, MissingGrade } from './errors';

/** A grade as the server has it. The version goes up with every save. */
export type SavedGrade = StoredGrade & { version: number };

export type GradeRequest =
  | {
      intent: 'save';
      entryId: string;
      apparatus: string;
      grade: StoredGrade;
      /** Of the saved grade the input is based on. The server refuses it when there is a newer one. */
      version: number | null;
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
