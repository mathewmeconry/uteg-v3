import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { draftKey } from '~/components/grading/draftStore';
import { GradeInputs } from '~/components/grading/GradeInputs';
import { ConflictNotice, RejectedNotice, SaveState, Warning } from '~/components/grading/SaveState';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import type { GradeResult } from '~/lib/gradeRequests';
import { cn } from '~/lib/utils';
import { findNeighbour } from './judgeState';
import { fullName, type TabletSlot } from './types';

/** One starter: who it is, the grade and the way to the next one. */
export function StarterForm({
  slot,
  slots,
  drafts,
  fromReview,
  onMove,
}: {
  slot: TabletSlot;
  /** The round. */
  slots: readonly TabletSlot[];
  drafts: GradeDrafts;
  fromReview: boolean;
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

  useEffect(() => {
    if (firstInput.current) firstInput.current.select();
    else heading.current?.focus();
  }, []);

  function moveOn() {
    onMove(fromReview ? 'review' : (next?.entryId ?? 'review'));
  }

  async function finish(answer: Promise<GradeResult>) {
    if ((await answer).ok) moveOn();
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
      className="grid grid-cols-1 gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-2">
        <p className="font-medium text-muted-foreground">
          {t('position', { position: index + 1, total: slots.length })}
        </p>
        <Progress
          aria-label={t('position', { position: index + 1, total: slots.length })}
          value={((index + 1) / slots.length) * 100}
        />
      </div>

      <div className="grid gap-2 text-center">
        <h2
          ref={heading}
          tabIndex={-1}
          className={cn(
            'text-4xl font-black break-words outline-none sm:text-6xl',
            slot.withdrawn && 'text-muted-foreground line-through',
          )}
        >
          {fullName(slot)}
        </h2>
        <p className="text-xl sm:text-2xl">
          {slot.clubName} ·{' '}
          <span className="font-bold">
            {slot.category} {t(`sexShort.${slot.sex}`)}
          </span>
        </p>
      </div>

      {slot.withdrawn ? (
        <div className="grid justify-items-center gap-2 text-center">
          <Badge variant="destructive" className="text-base">
            {t('withdrawn')}
          </Badge>
          <p>{t('withdrawnText')}</p>
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-xl gap-4">
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
            <SaveState state={state} className="justify-center text-lg" />
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
              <p>{t('save.failedText')}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void finish(drafts.submit(key))}>
                  {t('save.retry')}
                </Button>
                <Button type="button" variant="outline" onClick={moveOn}>
                  {t('save.continue')}
                </Button>
              </div>
            </Warning>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-16 px-6 text-xl"
          disabled={!previous || state.isSaving}
          onClick={() => previous && onMove(previous.entryId)}
        >
          <ArrowLeftIcon aria-hidden className="size-6" />
          {t('common:actions.back')}
        </Button>
        <Button
          type="submit"
          className="h-16 grow px-6 text-xl sm:max-w-80"
          disabled={state.isSaving || state.isConflict}
        >
          {state.isSaving && <LoaderCircleIcon aria-hidden className="size-6 animate-spin" />}
          {fromReview ? t('toReviewAgain') : next ? t('common:actions.next') : t('toReview')}
          <ArrowRightIcon aria-hidden className="size-6" />
        </Button>
      </div>
      <p className="truncate text-center text-lg text-muted-foreground">
        {next ? t('nextUp', { name: fullName(next) }) : t('lastOfRound')}
      </p>
    </form>
  );
}
