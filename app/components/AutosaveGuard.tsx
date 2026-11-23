import { useEffect, useEffectEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';
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
  const isBusy = useRef(false);
  // Going somewhere else meanwhile replaces the target.
  const latest = useRef(blocker);

  const onBlocked = useEffectEvent(async () => {
    if (isBusy.current) return;
    isBusy.current = true;
    await Promise.all([...openAutosavers].map((saver) => saver.settle()));
    const mayLeave = !isUnsaved() || window.confirm(t('leaveUnsaved'));
    isBusy.current = false;
    const { current } = latest;
    if (current.state !== 'blocked') return;
    if (mayLeave) current.proceed();
    else current.reset();
  });

  useEffect(() => {
    latest.current = blocker;
    if (blocker.state === 'blocked') void onBlocked();
  }, [blocker]);

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isUnsaved() {
  return [...openAutosavers].some((saver) => saver.isUnsaved());
}
