import { UnlinkIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { EmptyState } from './EmptyState';

type Status = 'idle' | 'checking' | 'invalid';

/**
 * Wraps the pages of judges and displays. A key after "#" (see accessUrl) is exchanged for a cookie
 * and removed from the address, also when the page is already open with an older one. Denied pages
 * use it too, without children: the key is what makes them accessible.
 */
export function AccessGate({ children }: { children?: ReactNode }) {
  const { t } = useTranslation(['judging', 'common']);
  const navigate = useNavigate();
  // The server does not see the key, so a denied page cannot know yet whether there is one.
  const [status, setStatus] = useState<Status>(children ? 'idle' : 'checking');
  const attempts = useRef(0);

  useEffect(() => {
    async function exchangeKey() {
      const { hash, pathname, search } = window.location;
      const key = hash.slice(1);
      if (!key) {
        // Not when an effect of StrictMode runs again after the key was removed.
        if (attempts.current === 0) setStatus('idle');
        return;
      }
      window.history.replaceState(window.history.state, '', pathname + search);
      const attempt = ++attempts.current;
      setStatus('checking');
      const isValid = await logIn(pathname, key);
      if (attempt !== attempts.current) return;
      // Not revalidate(): an error page only goes away for sure with a navigation.
      if (isValid) await navigate({ pathname, search }, { replace: true });
      setStatus(isValid ? 'idle' : 'invalid');
    }

    const onHashChange = () => void exchangeKey();
    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [navigate]);

  if (status === 'checking') {
    return (
      <main className="p-6 text-center text-muted-foreground" role="status">
        {t('common:loading')}
      </main>
    );
  }
  if (status === 'idle' && children) return children;
  return (
    <main className="p-6">
      <EmptyState icon={UnlinkIcon} title={t('linkInvalidTitle')} text={t('linkInvalidText')} />
    </main>
  );
}

async function logIn(pathname: string, token: string) {
  try {
    const response = await fetch(`/api${pathname.replace(/\/$/, '')}/login`, {
      method: 'POST',
      body: new URLSearchParams({ token }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
