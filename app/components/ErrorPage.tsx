import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Logo } from './Logo';

/** Full page for 403, 404 and everything else. Plain links, so a broken app state is left behind. */
export function ErrorPage({ status, detail }: { status: number; detail?: string }) {
  const { t } = useTranslation();
  const kind = status === 404 ? 'notFound' : status === 403 ? 'forbidden' : 'server';

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo className="size-12" />
      <p className="figure text-7xl leading-none">{status}</p>
      <h1 className="font-display text-2xl">{t(`errors.${kind}Title`)}</h1>
      <p className="max-w-prose text-muted-foreground">{t(`errors.${kind}Text`)}</p>
      {detail && <pre className="max-w-full overflow-auto text-left text-sm">{detail}</pre>}
      <div className="flex flex-wrap justify-center gap-2">
        {kind === 'server' && (
          <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
        )}
        <Button asChild variant="outline">
          <a href="/">{t('errors.toHome')}</a>
        </Button>
      </div>
    </main>
  );
}
