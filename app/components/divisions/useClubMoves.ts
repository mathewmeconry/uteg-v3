import { useMemo, useState } from 'react';
import { applyMoves, type ClubMove, type ProposedDivision } from './proposal';

/** The proposal with the clubs that were moved. A new proposal starts without moves. */
export function useClubMoves(proposal: ProposedDivision[] | null) {
  const [state, setState] = useState<{ proposal: typeof proposal; moves: ClubMove[] }>({
    proposal,
    moves: [],
  });
  const isCurrent = state.proposal === proposal;
  const moves = isCurrent ? state.moves : NONE;
  return {
    divisions: useMemo(() => proposal && applyMoves(proposal, moves), [proposal, moves]),
    isMoved: moves.length > 0,
    /** There were moves in the proposal before. */
    isLost: !isCurrent && state.moves.length > 0,
    move: (move: ClubMove) => setState({ proposal, moves: [...moves, move] }),
    reset: () => setState({ proposal, moves: [] }),
  };
}

// The same every time, for useMemo.
const NONE: ClubMove[] = [];
