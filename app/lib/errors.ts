export type DomainErrorCode =
  | 'ALREADY_MEMBER'
  | 'ATHLETE_ALREADY_STARTS'
  | 'CONFIG_CHANGED'
  | 'DIVISION_MISMATCH'
  | 'DIVISION_NOT_ENDED'
  | 'DIVISION_NOT_RUNNING'
  | 'DIVISION_RUNNING'
  | 'ENTRY_NOT_JUDGEABLE'
  | 'ENTRY_WITHDRAWN'
  | 'FILE_TOO_LARGE'
  | 'FORBIDDEN'
  | 'GRADES_MISSING'
  | 'GRADE_CHANGED'
  | 'GROUND_IN_USE'
  | 'IMAGE_TOO_LARGE'
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
  | 'STARTER_REMOVED'
  | 'STV_ID_CONFLICT'
  | 'USER_NOT_FOUND';

export type MissingGrade = {
  entryId: string;
  firstname: string;
  lastname: string;
  apparatus: string;
};

export type DomainErrorDetails = { missing?: MissingGrade[] };

/** A failure the user can cause and has to be told about. The code is a translation key. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    /** GRADES_MISSING: the grades that are missing. */
    readonly details: DomainErrorDetails = {},
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
