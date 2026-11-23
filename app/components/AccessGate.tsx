import { UnlinkIcon } from 'lucide-react';
import { startTransition, useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { WRONG_KEY_HEADER } from '~/lib/access';
import { EmptyState } from './EmptyState';

const RETRY_MS = 5_000;
/** As created by access.server.ts. Other hashes are ordinary anchors. */
const KEY = /^#([\w-]{43})$/;

/**
 * Wraps the pages of judges and displays. A key after "#" (see accessUrl) is exchanged for a cookie,
 * also when the page is already open with an older one, and then removed from the address. Until
 * then it stays there, so that it survives a reload. Denied pages use it too, without children: the
 * key is what makes them accessible.
 */
export function AccessGate({ children }: { children?: ReactNode }) {
  const { t } = useTranslation(['judging', 'common']);
  const navigate = useNavigate();
  const [isInvalid, setIsInvalid] = useState(false);
  const isDenied = !children;
  const onIgnored = useEffectEvent(() => {
    toast.error(t('linkIgnored'), { id: 'linkIgnored', duration: Infinity, closeButton: true });
  });

  useEffect(() => {
    let isDisposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function exchange() {
      clearTimeout(retry);
      const key = getKey();
      if (isDenied) setIsInvalid(!key);
      if (!key) return;
      const { pathname, search } = window.location;
      const answer = await logIn(pathname, key);
      if (isDisposed || getKey() !== key) return;
      if (!answer) {
        retry = setTimeout(() => void exchange(), RETRY_MS);
        return;
      }
      window.history.replaceState(window.history.state, '', pathname + search);
      // Not revalidate(): an error page only goes away for sure with a navigation.
      if (answer === 'ok') await navigate({ pathname, search }, { replace: true });
      // A working page stays, whatever link was opened on it.
      else if (!isDenied) onIgnored();
      // After the navigation, if this is still a denied page the key was of no use.
      startTransition(() => setIsInvalid(isDenied));
    }

    const onHashChange = () => void exchange();

    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => {
      isDisposed = true;
      clearTimeout(retry);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [navigate, isDenied]);

  if (isInvalid) {
    return (
      <main id="content" className="p-6">
        <EmptyState icon={UnlinkIcon} title={t('linkInvalidTitle')} text={t('linkInvalidText')} />
      </main>
    );
  }
  // The server does not see the key, so a denied page cannot know yet whether there is one.
  return (
    children ?? (
      <main id="content" className="p-6 text-center text-muted-foreground" role="status">
        {t('common:loading')}
      </main>
    )
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getKey() {
  return KEY.exec(window.location.hash)?.[1] ?? null;
}

/** Null without an answer of the app itself: a proxy may answer with 403 as well. */
async function logIn(pathname: string, token: string) {
  try {
    const response = await fetch(`/api${pathname.replace(/\/$/, '')}/login`, {
      method: 'POST',
      body: new URLSearchParams({ token }),
    });
    if (response.status === 204) return 'ok';
    return response.status === 403 && response.headers.has(WRONG_KEY_HEADER) ? 'wrong' : null;
  } catch {
    return null;
  }
}
