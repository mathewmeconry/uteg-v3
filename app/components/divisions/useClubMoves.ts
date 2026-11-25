import { useMemo, useState } from 'react';
import { applyMoves, type ClubMove, type ProposedDivision } from './proposal';

type Moved = { proposal: ProposedDivision[]; moves: ClubMove[] };

/** The moves by the settings they were made with, so that they are there again with the same ones. */
export function useMovedProposals() {
  return useState<Partial<Record<string, Moved>>>({});
}

/**
 * The proposal with the clubs that were moved. With moves it stays as it was, also when the starters
 * change meanwhile.
 */
export function useClubMoves(
  proposal: ProposedDivision[] | null,
  settings: string,
  [allMoved, setAllMoved]: ReturnType<typeof useMovedProposals>,
) {
  const moved = proposal ? allMoved[settings] : undefined;
  const current = moved?.proposal ?? proposal;
  const moves = moved?.moves;
  return {
    divisions: useMemo(() => current && applyMoves(current, moves ?? []), [current, moves]),
    isMoved: moved !== undefined,
    /** There is a newer proposal. */
    isOutdated: useMemo(
      () => moved !== undefined && JSON.stringify(moved.proposal) !== JSON.stringify(proposal),
      [moved, proposal],
    ),
    move(move: ClubMove) {
      if (!current) return;
      setAllMoved({
        ...allMoved,
        [settings]: { proposal: current, moves: [...(moves ?? []), move] },
      });
    },
    reset: () => setAllMoved({ ...allMoved, [settings]: undefined }),
  };
}
