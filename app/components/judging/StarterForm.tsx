import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { draftKey } from '~/components/grading/draftStore';
import { GradeInputs } from '~/components/grading/GradeInputs';
import { ConflictNotice, RejectedNotice, SaveState, Warning } from '~/components/grading/SaveState';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { GradeResult } from '~/lib/gradeRequests';
import { cn } from '~/lib/utils';
import { findNeighbour } from './judgeState';
import { fullName, type TabletSlot } from './types';

/** In the bar of the round: saved, entered but not saved, open. */
function segmentColor({ saved, isDirty }: ReturnType<GradeDrafts['get']>) {
  if (isDirty) return 'bg-warning';
  return saved ? 'bg-success' : 'bg-primary/20';
}

/** One starter: who it is, the grade and the way to the next one. */
export function StarterForm({
  slot,
  slots,
  drafts,
  fromReview = false,
  isPast = false,
  takeFocus,
  onMove,
}: {
  slot: TabletSlot;
  /** The round, only the starter itself when `isPast`. */
  slots: readonly TabletSlot[];
  drafts: GradeDrafts;
  fromReview?: boolean;
  /** A single grade of a confirmed round. */
  isPast?: boolean;
  /** Not when it appears by itself: the judge may be typing for someone else. */
  takeFocus: boolean;
  onMove: (view: 'review' | string) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const [showRequired, setShowRequired] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const state = drafts.get(slot);
  const key = draftKey(slot);
  const index = slots.findIndex(({ entryId }) => entryId === slot.entryId);
  const next = findNeighbour(slots, slot.entryId, 1);
  const previous = findNeighbour(slots, slot.entryId, -1);

  const isShown = useRef(false);
  const initial = useRef({ takeFocus, isDirty: state.isDirty });

  useEffect(() => {
    isShown.current = true;
    const input = firstInput.current;
    if (initial.current.takeFocus) {
      if (!input) heading.current?.focus();
      input?.focus();
      // What is being typed goes on, a saved grade is replaced.
      input?.setSelectionRange(
        initial.current.isDirty ? input.value.length : 0,
        input.value.length,
      );
    }
    return () => {
      isShown.current = false;
    };
  }, []);

  const fields = useRef<HTMLDivElement>(null);
  const needsAnswer = state.isConflict || (state.isFailed && !state.isSaving);
  useEffect(() => {
    // In large type the question would appear behind the buttons.
    if (needsAnswer) fields.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }, [needsAnswer]);

  const { leave } = drafts;
  useEffect(() => () => leave(key), [leave, key]);

  function moveOn() {
    onMove(fromReview ? 'review' : (next?.entryId ?? 'review'));
  }

  async function finish(answer: Promise<GradeResult>) {
    const { ok } = await answer;
    // The judge may have opened someone else meanwhile and be typing there.
    if (ok && isShown.current) moveOn();
  }

  function submit() {
    if (slot.withdrawn) return moveOn();
    if (state.isSaving || state.isConflict) return;
    if (!state.evaluated.grade) {
      setShowRequired(true);
      firstInput.current?.focus();
      return;
    }
    if (!state.isDirty) return moveOn();
    void finish(drafts.submit(key));
  }

  return (
    <form
      noValidate
      className="grid grid-cols-1 gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {isPast ? (
        <p className="rounded-xl bg-warning px-5 py-3 text-lg font-semibold text-warning-foreground">
          {t('pastRound')}
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <p className="shrink-0 text-lg text-muted-foreground">
            {t('position', { position: index + 1, total: slots.length })}
          </p>
          <div
            role="progressbar"
            aria-label={t('position', { position: index + 1, total: slots.length })}
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={slots.length}
            className="flex flex-1 gap-1"
          >
            {slots.map((item) => (
              <span
                key={item.entryId}
                className={cn(
                  'h-3 flex-1 rounded-sm',
                  item.entryId === slot.entryId ? 'bg-foreground' : segmentColor(drafts.get(item)),
                )}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-1.5 text-center">
        <h2
          ref={heading}
          tabIndex={-1}
          className={cn(
            'font-display text-5xl leading-[1.05] wrap-anywhere outline-none @2xl:text-7xl',
            slot.withdrawn && 'text-muted-foreground line-through',
          )}
        >
          {fullName(slot)}
        </h2>
        <p className="text-xl wrap-anywhere @2xl:text-2xl">
          {slot.clubName} ·{' '}
          <span className="font-bold">
            {slot.category} {t(`sexShort.${slot.sex}`)}
          </span>
        </p>
      </div>

      {slot.withdrawn ? (
        <div className="grid justify-items-center gap-2 text-center">
          <Badge variant="destructive" className="px-3 py-1 text-xl">
            {t('withdrawn')}
          </Badge>
          <p className="text-lg">{t('withdrawnText')}</p>
        </div>
      ) : (
        // Attempts and the grade they give are in one line, so the buttons need no scrolling.
        <div
          ref={fields}
          className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 @2xl:[&_div:has(>input)]:flex-1 @2xl:[&_div:has(>input)]:basis-32 [&_input]:h-24 [&_input]:rounded-xl [&_input]:border-2 [&_input]:text-6xl [&_input]:[font-stretch:85%] md:[&_input]:text-6xl"
        >
          <GradeInputs
            large
            fields={state.fields}
            evaluated={state.evaluated}
            rule={slot.inputRule}
            name={fullName(slot)}
            showRequired={showRequired}
            disabled={state.isSaving}
            firstInput={firstInput}
            onChange={(fields) => drafts.change(slot, state.saved, fields)}
            onSubmit={submit}
          />
          {!state.isConflict && !state.rejected && !(state.isFailed && !state.isSaving) && (
            // As high as it gets, so that the buttons stay where they are.
            <SaveState
              state={state}
              className={cn(
                'min-h-13 justify-center rounded-xl px-4 text-xl font-semibold [&>svg]:size-6',
                !state.isSaving &&
                  (state.isDirty
                    ? 'bg-warning text-warning-foreground dark:text-warning-foreground'
                    : state.saved && 'bg-success text-success-foreground'),
              )}
            />
          )}
          {state.isConflict && (
            <ConflictNotice
              state={state}
              onUseSaved={() => drafts.discard(key)}
              onUseOwn={() => void finish(drafts.overwrite(key, state.saved))}
            />
          )}
          {state.rejected && <RejectedNotice code={state.rejected} />}
          {state.isFailed && !state.isSaving && (
            <Warning title={t('save.failedTitle')}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 basis-72 leading-snug">{t('save.failedText')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void finish(drafts.submit(key))}>
                    {t('save.retry')}
                  </Button>
                  <Button type="button" variant="outline" onClick={moveOn}>
                    {t('save.continue')}
                  </Button>
                </div>
              </div>
            </Warning>
          )}
        </div>
      )}

      <div
        data-slot="form-actions"
        className="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-between gap-3 bg-background px-4 py-2 sm:-mx-6 sm:px-6"
      >
        <Button
          type="button"
          variant="outline"
          className="h-20 rounded-xl px-6 text-xl"
          disabled={!(previous || isPast) || state.isSaving}
          onClick={() => onMove(previous?.entryId ?? 'review')}
        >
          <ArrowLeftIcon aria-hidden className="size-6" />
          {t('common:actions.back')}
        </Button>
        <Button
          type="submit"
          className="h-auto grow rounded-xl px-6 py-6 text-2xl whitespace-normal @2xl:max-w-xl"
          disabled={state.isSaving || state.isConflict}
        >
          {state.isSaving && <LoaderCircleIcon aria-hidden className="size-6 animate-spin" />}
          {isPast
            ? t('common:actions.save')
            : fromReview
              ? t('toReviewAgain')
              : next
                ? t('common:actions.next')
                : t('toReview')}
          <ArrowRightIcon aria-hidden className="size-6" />
        </Button>
      </div>
      {!isPast && (
        <p className="truncate text-center text-xl text-muted-foreground">
          {next ? t('nextUp', { name: fullName(next) }) : t('lastOfRound')}
        </p>
      )}
    </form>
  );
}
