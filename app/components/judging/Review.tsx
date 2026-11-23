import { CheckIcon, LoaderCircleIcon, PencilIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SaveState, Warning } from '~/components/grading/SaveState';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useApparatusName } from '~/hooks/useApparatusName';
import { formatEntered } from '~/lib/domain/gradeInput';
import type { MissingGrade } from '~/lib/errors';
import { cn } from '~/lib/utils';
import { fullName, type TabletSlot } from './types';

export type Confirmation = {
  isConfirming: boolean;
  error: string | null;
  /** The grades that keep the division from ending, also on other apparatus. */
  missing: MissingGrade[];
  confirm: () => void;
};

/** The grade that was entered, also when it is not sent yet. */
function ReviewGrade({ state }: { state: ReturnType<GradeDrafts['get']> }) {
  const { t } = useTranslation('judging');
  const grade = state.isDirty && !state.isConflict ? state.evaluated.grade : state.saved;
  if (!grade) return <Badge variant="destructive">{t('review.missing')}</Badge>;
  return (
    <span className={cn('figure text-3xl', state.isDirty && 'text-destructive')}>
      {formatEntered(grade.value)}
    </span>
  );
}

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
  const apparatusName = useApparatusName();
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
  const expected = rows.filter(({ slot }) => !slot.withdrawn);
  const unsent = expected.filter(({ state }) => state.isDirty).length;
  const missing = expected.filter(({ state }) => !state.isDirty && state.saved === null).length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className={cn(isPause && 'rounded-xl bg-muted px-4 py-14 text-center')}>
        <h2
          ref={heading}
          tabIndex={-1}
          className={cn('font-display outline-none', isPause ? 'text-7xl' : 'text-4xl')}
        >
          {t(isPause ? 'pause.title' : 'review.title')}
        </h2>
        <p className="mt-2 text-lg text-muted-foreground">
          {t(isPause ? 'pause.text' : 'review.text')}
        </p>
      </div>

      <ol className="grid grid-cols-1 divide-y overflow-hidden rounded-xl border bg-card empty:hidden">
        {rows.map(({ slot, state }, index) => (
          <li key={slot.entryId}>
            <button
              type="button"
              disabled={slot.withdrawn}
              className={cn(
                'flex min-h-18 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left hover:enabled:bg-accent',
                !slot.withdrawn &&
                  !state.isDirty &&
                  state.saved === null &&
                  'bg-[color-mix(in_oklab,var(--destructive)_8%,var(--card))]',
              )}
              onClick={() => onEdit(slot.entryId)}
            >
              <span className="figure w-8 text-right text-lg text-muted-foreground">
                {index + 1}.
              </span>
              <span className={cn('min-w-0 flex-1 basis-32', slot.withdrawn && 'line-through')}>
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
                  <ReviewGrade state={state} />
                  <PencilIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </li>
        ))}
      </ol>

      {confirmation.error && (
        <Warning title={confirmation.error}>
          {confirmation.missing.length > 0 && (
            <>
              <ul className="list-disc pl-6 text-lg font-medium">
                {confirmation.missing.map((missing) => (
                  <li key={`${missing.entryId}-${missing.apparatus}`}>
                    {fullName(missing)} ({apparatusName(missing.apparatus)})
                  </li>
                ))}
              </ul>
              <p>{t('review.missingText')}</p>
            </>
          )}
        </Warning>
      )}
      <div className="flex flex-wrap items-center justify-end gap-4">
        {missing > 0 && (
          <p className="text-lg font-medium text-destructive">
            {t('review.blocked', { count: missing })}
          </p>
        )}
        {unsent > 0 && (
          <p className="text-lg font-medium text-destructive">
            {t('review.unsent', { count: unsent })}
          </p>
        )}
        <Button
          className="h-auto grow rounded-xl px-8 py-6 text-2xl whitespace-normal"
          disabled={missing + unsent > 0 || confirmation.isConfirming || !isReady}
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
