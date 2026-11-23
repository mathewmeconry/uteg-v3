import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { applyMove, UNASSIGNED, type Column, type Move } from './lineupMoves';

type PendingMove = {
  move: Move;
  /** The data on the page when the server was done with the move. */
  doneWith?: object;
};

/**
 * Shows moves at once and sends them one after the other, so the server applies them in the order
 * they were made. `loaderData` is what `serverColumns` was made from: the next one after a move
 * shows its result, also when it failed.
 */
export function useLineupMoves(serverColumns: Column[], loaderData: object) {
  const fetcher = useFetcher();
  const [pending, setPending] = useState<PendingMove[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latestData = useRef(loaderData);
  useEffect(() => {
    latestData.current = loaderData;
  }, [loaderData]);

  function move(next: Move) {
    setPending((current) => [...current, { move: next }]);
    queue.current = queue.current
      .then(() => fetcher.submit(toFormData(next), { method: 'post' }))
      .catch(() => undefined)
      .then(() => {
        // The router is done before the page shows the new data. Dropping the move here would make
        // the entry jump back for a moment.
        const doneWith = latestData.current;
        setPending((current) =>
          current
            .filter((item) => !item.doneWith || item.doneWith === doneWith)
            .map((item) => (item.move === next ? { ...item, doneWith } : item)),
        );
      });
  }

  const columns = pending
    .filter(
      ({ move, doneWith }) =>
        !doneWith || (doneWith === loaderData && !isApplied(serverColumns, move)),
    )
    .reduce((current, item) => applyMove(current, item.move), serverColumns);
  return { columns, move };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isApplied(columns: Column[], move: Move) {
  return applyMove(columns, move).every(({ entryIds }, index) =>
    entryIds.every((id, position) => id === columns[index].entryIds[position]),
  );
}

function toFormData({ entryIds, columnId, beforeId }: Move) {
  const formData = new FormData();
  for (const id of entryIds) formData.append('entry', id);
  if (columnId === UNASSIGNED) {
    formData.set('intent', 'unassign');
  } else {
    formData.set('intent', 'move');
    formData.set('lineup', columnId);
    if (beforeId) formData.set('before', beforeId);
  }
  return formData;
}
