/** A lineup, or everyone without one. */
export type Column = { id: string; entryIds: string[] };

export const UNASSIGNED = 'unassigned';

/** Puts entries into a column, before another entry or at the end. */
export type Move = { entryIds: string[]; columnId: string; beforeId?: string };

/** Does what the server will do with the move. */
export function applyMove(columns: readonly Column[], { entryIds, columnId, beforeId }: Move) {
  return columns.map((column) => {
    const others = column.entryIds.filter((id) => !entryIds.includes(id));
    if (column.id !== columnId) return { ...column, entryIds: others };
    const index = others.findIndex((id) => id === beforeId);
    return {
      ...column,
      entryIds: others.toSpliced(index < 0 ? others.length : index, 0, ...entryIds),
    };
  });
}

export function findColumn(columns: readonly Column[], entryId: string) {
  return columns.find(({ entryIds }) => entryIds.includes(entryId));
}

/** Moves an entry past its neighbour. `visible` are the column's entries the filter shows. */
export function stepMove(
  columnId: string,
  visible: readonly string[],
  entryId: string,
  step: 'up' | 'down',
): Move | null {
  const index = visible.indexOf(entryId);
  if (step === 'up') {
    return index <= 0 ? null : { entryIds: [entryId], columnId, beforeId: visible[index - 1] };
  }
  if (index === visible.length - 1) return null;
  return { entryIds: [entryId], columnId, beforeId: visible[index + 2] };
}
