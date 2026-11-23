export type DomainErrorCode =
  | 'ALREADY_MEMBER'
  | 'ATHLETE_ALREADY_STARTS'
  | 'DIVISION_MISMATCH'
  | 'DIVISION_NOT_RUNNING'
  | 'DIVISION_RUNNING'
  | 'ENTRY_NOT_JUDGEABLE'
  | 'ENTRY_WITHDRAWN'
  | 'FILE_TOO_LARGE'
  | 'FORBIDDEN'
  | 'GRADES_MISSING'
  | 'GROUND_IN_USE'
  | 'INVALID_APPARATUS'
  | 'INVALID_CATEGORY'
  | 'INVALID_CONFIG'
  | 'INVALID_GRADE'
  | 'INVALID_GROUND'
  | 'INVALID_IMAGE'
  | 'INVALID_INPUT'
  | 'LAST_OWNER'
  | 'LINEUP_MISMATCH'
  | 'NOT_FOUND'
  | 'RESTART_NOT_CONFIRMED'
  | 'ROUND_NOT_CURRENT'
  | 'STV_ID_CONFLICT'
  | 'USER_NOT_FOUND';

/** A failure the user can cause and has to be told about. The code is a translation key. */
export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode) {
    super(code);
    this.name = 'DomainError';
  }
}
