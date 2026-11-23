export const MAX_COVER_PAGES = 4;
export const MAX_COVER_BYTES = 10 * 1024 * 1024;
/** A4 at 600 dpi has 4961 × 7016 pixels. */
export const MAX_COVER_MEGAPIXELS = 36;

/** Also codes of DomainError. */
export type CoverErrorCode = 'INVALID_COVER' | 'COVER_ENCRYPTED' | 'COVER_TOO_MANY_PAGES';

/** Set on PDFs whose stored cover could not be used. */
export const COVER_FAILED_HEADER = 'X-Cover-Failed';
