/**
 * Where things are on a page of the judging sheets, in points from the top left. The PDF draws it
 * and a scan reads it, so everything below the header has a fixed size.
 */
export const SHEET = {
  width: 595.28,
  height: 841.89,
  paddingTop: 32,
  paddingX: 40,
  paddingBottom: 40,
  /** Fits the longest competition name and list of divisions. */
  headerHeight: 120,
  headerGap: 12,
  tableHeaderHeight: 18,
  rowHeight: 32,
  /** Pages are cut here and not by react-pdf, so the QR code knows the rows of its page. */
  rowsPerPage: 18,
  qrSize: 80,
  cornerInset: 20,
  cornerSize: 14,
  /** Of the line left of each grade column. */
  border: 0.5,
};

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Wide, as grades are read from photos, but names stay readable with 4 attempts. */
export function gradeColumnWidth(attempts: number) {
  return [150, 92, 76, 64][attempts - 1] ?? 64;
}

/** The centres of the corner squares, clockwise from the top left. */
export function cornerCentres(): Point[] {
  const near = SHEET.cornerInset + SHEET.cornerSize / 2;
  return [
    { x: near, y: near },
    { x: SHEET.width - near, y: near },
    { x: SHEET.width - near, y: SHEET.height - near },
    { x: near, y: SHEET.height - near },
  ];
}

export function qrCodeRect(): Rect {
  const size = SHEET.qrSize;
  return { x: SHEET.width - SHEET.paddingX - size, y: SHEET.paddingTop, width: size, height: size };
}

/**
 * The cells grades are written in, by row: the attempts, then the final grade, or only the grade
 * when there is one attempt.
 */
export function gradeCells(attempts: number, rowCount: number): Rect[][] {
  const width = gradeColumnWidth(attempts) + SHEET.border;
  const columns = attempts > 1 ? attempts + 1 : 1;
  const left = SHEET.width - SHEET.paddingX - columns * width;
  const top = SHEET.paddingTop + SHEET.headerHeight + SHEET.headerGap + SHEET.tableHeaderHeight;
  return Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columns }, (_, column) => ({
      x: left + column * width + SHEET.border,
      y: top + row * SHEET.rowHeight,
      width: width - SHEET.border,
      height: SHEET.rowHeight,
    })),
  );
}
