import { CheckIcon, LoaderCircleIcon, PencilIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SaveState, Warning } from '~/components/grading/SaveState';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { formatEntered } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import { fullName, type TabletSlot } from './types';

export type Confirmation = {
  isConfirming: boolean;
  error: string | null;
  confirm: () => void;
};

/** All grades of the round before it is confirmed. Without starters it is a pause. */
export function Review({
  slots,
  drafts,
  confirmation,
  onEdit,
}: {
  slots: readonly TabletSlot[];
  drafts: GradeDrafts;
  confirmation: Confirmation;
  onEdit: (entryId: string) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const heading = useRef<HTMLHeadingElement>(null);
  const isPause = slots.length === 0;
  // A second tap on "confirm" must not confirm the pause that follows.
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    heading.current?.focus();
    const timer = setTimeout(() => setIsReady(true), 1_000);
    return () => clearTimeout(timer);
  }, []);

  const rows = slots.map((slot) => ({ slot, state: drafts.get(slot) }));
  const open = rows.filter(
    ({ slot, state }) => !slot.withdrawn && (state.isDirty || state.saved === null),
  ).length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className={cn(isPause && 'py-8 text-center')}>
        <h2
          ref={heading}
          tabIndex={-1}
          className={cn('font-black outline-none', isPause ? 'text-6xl' : 'text-3xl')}
        >
          {t(isPause ? 'pause.title' : 'review.title')}
        </h2>
        <p className="mt-2 text-lg text-muted-foreground">
          {t(isPause ? 'pause.text' : 'review.text')}
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-2 empty:hidden">
        {rows.map(({ slot, state }, index) => (
          <li key={slot.entryId}>
            <button
              type="button"
              disabled={slot.withdrawn}
              className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left hover:enabled:bg-accent"
              onClick={() => onEdit(slot.entryId)}
            >
              <span className="w-8 text-right text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <span className={cn('min-w-0 flex-1', slot.withdrawn && 'line-through')}>
                <span className="block text-xl font-bold wrap-anywhere">{fullName(slot)}</span>
                <span className="block truncate text-muted-foreground">
                  {slot.clubName} · {slot.category} {t(`sexShort.${slot.sex}`)}
                </span>
              </span>
              {slot.withdrawn ? (
                <Badge variant="outline">{t('withdrawn')}</Badge>
              ) : (
                <>
                  {state.isDirty && <SaveState state={state} className="text-sm" />}
                  {state.saved ? (
                    <span className="text-2xl font-black tabular-nums">
                      {formatEntered(state.saved.value)}
                    </span>
                  ) : (
                    <Badge variant="destructive">{t('review.missing')}</Badge>
                  )}
                  <PencilIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </li>
        ))}
      </ol>

      {confirmation.error && <Warning title={confirmation.error} />}
      <div className="flex flex-wrap items-center justify-end gap-4">
        {open > 0 && (
          <p className="text-lg font-medium text-destructive">
            {t('review.blocked', { count: open })}
          </p>
        )}
        <Button
          className="h-16 px-6 text-xl"
          disabled={open > 0 || confirmation.isConfirming || !isReady}
          onClick={confirmation.confirm}
        >
          {confirmation.isConfirming ? (
            <LoaderCircleIcon aria-hidden className="size-6 animate-spin" />
          ) : (
            <CheckIcon aria-hidden className="size-6" />
          )}
          {t('review.confirm')}
        </Button>
      </div>
    </div>
  );
}
