import { CheckIcon, LoaderCircleIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * What happened to the last change of a form that saves by itself. Always takes the same height, so
 * nothing moves while typing. Belongs next to the title or at the end of the form.
 */
export function SaveStatus({
  state,
  message,
  onRetry,
  className,
}: {
  state: SaveState;
  /** Instead of the general text of an error. */
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 text-sm pointer-coarse:min-h-11',
        className,
      )}
    >
      <p
        role="status"
        className={cn(
          'flex items-center gap-1.5 [&>svg]:size-4 [&>svg]:shrink-0',
          state === 'error' ? 'font-semibold text-destructive' : 'text-muted-foreground',
        )}
      >
        {state === 'saving' && (
          <>
            <LoaderCircleIcon aria-hidden className="animate-spin" />
            {t('saving')}
          </>
        )}
        {state === 'saved' && (
          <>
            <CheckIcon aria-hidden className="text-success" />
            {t('saved')}
          </>
        )}
        {state === 'error' && (
          <>
            <TriangleAlertIcon aria-hidden />
            {message ?? t('saveStatus.error')}
          </>
        )}
      </p>
      {state === 'error' && onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCwIcon aria-hidden />
          {t('saveStatus.retry')}
        </Button>
      )}
    </div>
  );
}
