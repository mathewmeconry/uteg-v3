import { UnlinkIcon } from 'lucide-react';
import { startTransition, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { EmptyState } from './EmptyState';

const RETRY_MS = 5_000;
/** As created by access.server.ts. Other hashes are ordinary anchors. */
const KEY = /^#([\w-]{43})$/;

/**
 * Wraps the pages of judges and displays. A key after "#" (see accessUrl) is exchanged for a cookie
 * and removed from the address, also when the page is already open with an older one. Denied pages
 * use it too, without children: the key is what makes them accessible.
 */
export function AccessGate({ children }: { children?: ReactNode }) {
  const { t } = useTranslation(['judging', 'common']);
  const navigate = useNavigate();
  const [isInvalid, setIsInvalid] = useState(false);
  const pendingKey = useRef<string | null>(null);
  const isDenied = !children;

  useEffect(() => {
    let isDisposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function takeKey() {
      const { hash, pathname, search } = window.location;
      const key = KEY.exec(hash)?.[1];
      if (!key) return;
      pendingKey.current = key;
      window.history.replaceState(window.history.state, '', pathname + search);
    }

    function onHashChange() {
      takeKey();
      void exchange();
    }

    async function exchange() {
      clearTimeout(retry);
      const key = pendingKey.current;
      if (isDenied) setIsInvalid(!key);
      if (!key) return;
      const { pathname, search } = window.location;
      const status = await logIn(pathname, key);
      if (isDisposed || pendingKey.current !== key) return;
      if (status !== 204 && status !== 403) {
        retry = setTimeout(() => void exchange(), RETRY_MS);
        return;
      }
      pendingKey.current = null;
      // Not revalidate(): an error page only goes away for sure with a navigation.
      if (status === 204) await navigate({ pathname, search }, { replace: true });
      // After the navigation, if this is still a denied page the key was of no use.
      startTransition(() => setIsInvalid(status === 403 || isDenied));
    }

    // A key may also still be pending when the effect runs again.
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

/** The status of the response, null without one. */
async function logIn(pathname: string, token: string) {
  try {
    const response = await fetch(`/api${pathname.replace(/\/$/, '')}/login`, {
      method: 'POST',
      body: new URLSearchParams({ token }),
    });
    return response.status;
  } catch {
    return null;
  }
}
