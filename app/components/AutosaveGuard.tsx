import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker, type Blocker } from 'react-router';
import { openAutosavers } from '~/lib/autosave';

/**
 * Keeps the page until its forms are saved, and asks when they cannot be. One for all forms,
 * because the router only knows one blocker.
 */
export function AutosaveGuard() {
  const { t } = useTranslation();
  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) => {
    const isSamePage =
      currentLocation.pathname === nextLocation.pathname &&
      currentLocation.search === nextLocation.search &&
      historyAction === 'REPLACE';
    return !isSamePage && isUnsaved();
  });

  const onBlocked = useEffectEvent(async ({ proceed, reset }: BlockedBlocker) => {
    await Promise.all([...openAutosavers].map((saver) => saver.settle()));
    if (!isUnsaved() || window.confirm(t('leaveUnsaved'))) proceed();
    else reset();
  });

  useEffect(() => {
    if (blocker.state === 'blocked') void onBlocked(blocker);
  }, [blocker]);

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type BlockedBlocker = Extract<Blocker, { state: 'blocked' }>;

function isUnsaved() {
  return [...openAutosavers].some((saver) => saver.isUnsaved());
}
