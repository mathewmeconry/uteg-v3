import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRevalidator } from 'react-router';
import { toast } from 'sonner';
import { isServerReachable } from '~/lib/reachable';
import { applyMove, UNASSIGNED, type Column, type Move } from './lineupMoves';

const TIMEOUT_MS = 15_000;

/** `savedWith` is the data the page showed when the server had saved the move. */
type PendingMove = { move: Move; savedWith?: object };

/**
 * Shows moves at once and sends them to `url` one after the other, so the server applies them in
 * the order they were made, also after the page was left. `loaderData` is what `serverColumns` was
 * made from.
 */
export function useLineupMoves(url: string, serverColumns: Column[], loaderData: object) {
  const { t } = useTranslation();
  const { revalidate } = useRevalidator();
  const [pending, setPending] = useState<PendingMove[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const shownData = useRef(loaderData);
  useEffect(() => {
    shownData.current = loaderData;
  }, [loaderData]);

  function move(next: Move) {
    setPending((current) => [...current, { move: next }]);
    queue.current = queue.current.then(() => send(next));
  }

  async function send(next: Move) {
    const result = await post(url, next);
    const savedWith = shownData.current;
    setPending((current) =>
      current
        .filter((item) => item.move !== next || result.ok)
        .filter((item) => !item.savedWith || item.savedWith === savedWith)
        .map((item) => (item.move === next ? { ...item, savedWith } : item)),
    );
    if (result.ok) return void revalidate();
    // The server sends the browser to the login page and back.
    if (result.signedOut) return location.reload();

    const message = result.forbidden ? t('domainErrors.FORBIDDEN') : result.error;
    // One toast, also when several moves fail in a row.
    toast.error(message ?? t('errors.connection'), { id: 'lineup-move' });
    if (await isServerReachable()) void revalidate();
  }

  const columns = pending
    // A saved move stays until the next data, which contains it. Otherwise it would jump back.
    .filter(({ savedWith }) => !savedWith || savedWith === loaderData)
    .reduce((current, item) => applyMove(current, item.move), serverColumns);
  return { columns, move };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type PostResult = { ok: boolean; error?: string; forbidden?: boolean; signedOut?: boolean };

async function post(url: string, move: Move): Promise<PostResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: toFormData(move),
      redirect: 'manual',
      // Moves wait for the one before.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.type === 'opaqueredirect') return { ok: false, signedOut: true };
    if (response.status === 403) return { ok: false, forbidden: true };
    const body = (await response.json()) as { ok?: boolean; error?: string } | null;
    return { ok: response.ok && body?.ok === true, error: body?.error };
  } catch {
    // No connection, or a proxy answered instead of the server.
    return { ok: false };
  }
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
