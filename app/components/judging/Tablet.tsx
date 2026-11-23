import { CircleCheckBigIcon, HourglassIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRevalidator } from 'react-router';
import { isUntouched, useGradeDrafts } from '~/components/grading/useGradeDrafts';
import { EmptyState } from '~/components/EmptyState';
import type { MissingGrade } from '~/lib/errors';
import { sendGradeRequest } from '~/lib/gradeRequests';
import {
  getNotices,
  hasJustEnded,
  mergeNotices,
  resolvePosition,
  type Notice,
  type Position,
  type TabletState,
} from './judgeState';
import { Notices } from './Notices';
import { Review } from './Review';
import { RoundsSheet } from './RoundsSheet';
import { StarterForm } from './StarterForm';
import { StarterList } from './StarterList';
import type { DivisionSummary, TabletRound } from './types';
import { UnsavedGrades } from './UnsavedGrades';

export type TabletData = Omit<TabletState, 'divisions' | 'rounds'> & {
  divisions: DivisionSummary[];
  divisionIds: string[];
  rounds: TabletRound[];
  loadedAt: number;
};

/** What the judges of one apparatus see below the header. */
export function Tablet({
  linkId,
  url,
  data,
}: {
  linkId: string;
  /** Where grades are sent. */
  url: string;
  data: TabletData;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const { revalidate } = useRevalidator();
  const { currentRound, rounds } = data;
  const allSlots = useMemo(() => rounds.flatMap(({ slots }) => slots), [rounds]);
  const drafts = useGradeDrafts({
    url,
    storageKey: `grades:${linkId}`,
    loadedAt: data.loadedAt,
  });

  const [changes, setChanges] = useState({ data, notices: [] as Notice[], hasEnded: false });
  if (changes.data !== data) {
    setChanges({
      data,
      notices: mergeNotices(changes.notices, getNotices(changes.data, data), data),
      hasEnded: data.status === 'WAITING' && (changes.hasEnded || hasJustEnded(changes.data, data)),
    });
  }

  const [position, setPosition] = useState<Position | null>(null);
  /** Opened to enter or correct a grade of a confirmed round. */
  const [pastEntryId, setPastEntryId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState({
    round: -1,
    isConfirming: false,
    error: null as string | null,
    missing: [] as MissingGrade[],
  });

  const slots = currentRound === null ? [] : rounds[currentRound].slots;
  const resolved =
    currentRound === null
      ? null
      : resolvePosition(position, currentRound, slots, (entryId) => {
          const slot = slots.find((item) => item.entryId === entryId)!;
          const { saved, isWaiting, isSaving } = drafts.get(slot);
          return saved !== null || isWaiting || isSaving;
        });
  const pastSlots = rounds
    .filter(({ round }) => currentRound === null || round < currentRound)
    .flatMap((item) => item.slots);
  // Kept, so the judge stays at a starter whose grade arrives from elsewhere.
  if (resolved !== position) {
    setPosition(resolved);
    // Confirmed elsewhere while typing: the rest must not end up at the next starter.
    const left = pastSlots.find(({ entryId }) => entryId === position?.view);
    if (left && drafts.get(left).isDirty && pastEntryId === null) setPastEntryId(left.entryId);
  }

  const past = pastSlots.find(({ entryId }) => entryId === pastEntryId);
  const current = past ?? slots.find(({ entryId }) => entryId === resolved?.view);
  const unsaved = [...drafts.drafts.values()].filter((draft) => {
    if (draft.entryId === current?.entryId) return false;
    // Another tablet may have saved the same grade.
    const slot = allSlots.find(({ entryId }) => entryId === draft.entryId);
    return slot ? drafts.get(slot).isDirty : !isUntouched(draft);
  });

  function moveTo(view: string, fromReview = false) {
    setPastEntryId(null);
    if (currentRound !== null) {
      setPosition({ round: currentRound, view, fromReview, takeFocus: true });
    }
  }

  /** A starter of the current or a confirmed round. */
  function open(entryId: string) {
    if (slots.some((slot) => slot.entryId === entryId)) {
      moveTo(entryId, resolved?.view === 'review');
    } else {
      setPastEntryId(entryId);
    }
  }

  async function confirm() {
    if (currentRound === null) return;
    const round = currentRound;
    setConfirmation({ round, isConfirming: true, error: null, missing: [] });
    const { divisionIds } = data;
    const result = await sendGradeRequest(url, {
      intent: 'confirm',
      round,
      divisionIds,
    });
    // Also without an answer: it may be confirmed.
    await revalidate();
    const error = result.ok
      ? null
      : result.code === 'OFFLINE'
        ? t('review.failed')
        : result.code === 'GONE'
          ? t('save.revoked')
          : t(`common:domainErrors.${result.code}`);
    const missing = result.ok ? [] : (result.missing ?? []);
    setConfirmation({ round, isConfirming: false, error, missing });
  }

  const notices = (
    <Notices
      notices={changes.notices}
      onDismiss={(id) =>
        setChanges((state) => ({
          ...state,
          notices: state.notices.filter((notice) => notice.id !== id),
        }))
      }
    />
  );
  const unsavedGrades = unsaved.length > 0 && (
    <UnsavedGrades
      items={unsaved}
      slots={allSlots}
      drafts={drafts}
      onOpen={({ entryId }) => open(entryId)}
    />
  );
  const pastForm = past && (
    <StarterForm
      key={past.entryId}
      isPast
      takeFocus
      slot={past}
      slots={[past]}
      drafts={drafts}
      onMove={() => {
        setPastEntryId(null);
        setPosition((now) => now && { ...now, takeFocus: true });
      }}
    />
  );

  if (currentRound === null || !resolved) {
    const isFinished = data.status === 'FINISHED' || changes.hasEnded;
    return (
      <div className="@container mx-auto grid max-w-4xl grid-cols-1 gap-4">
        {notices}
        {unsavedGrades}
        {pastForm}
        <div role="status" className="text-xl wrap-anywhere">
          {isFinished ? (
            <EmptyState
              icon={CircleCheckBigIcon}
              title={<span className="text-5xl">{t('finished.title')}</span>}
              text={t('finished.text')}
            />
          ) : (
            <EmptyState
              icon={HourglassIcon}
              title={<span className="text-5xl">{t('waiting.title')}</span>}
              text={t('waiting.text')}
            />
          )}
        </div>
        {rounds.length > 0 && (
          <div className="flex justify-center">
            <RoundsSheet rounds={rounds} currentRound={null} drafts={drafts} onSelect={open} />
          </div>
        )}
      </div>
    );
  }

  return (
    // A container, because the width in rem depends on the font size of the device.
    <div className="@container mx-auto max-w-7xl">
      <div className="grid grid-cols-1 items-start gap-6 @5xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="@container grid min-w-0 grid-cols-1 gap-4">
          {notices}
          {unsavedGrades}
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-xl @md:text-2xl">
              {t('roundOf', { number: currentRound + 1, total: rounds.length })}
              <span className="ml-3 font-sans text-base @md:text-lgfont-normal text-muted-foreground [font-stretch:100%]">
                {data.divisions
                  .filter(({ id }) => data.divisionIds.includes(id))
                  .map(
                    ({ category, sex, number }) => `${category} ${t(`sexShort.${sex}`)} ${number}`,
                  )
                  .join(', ')}
              </span>
            </p>
            <RoundsSheet
              rounds={rounds}
              currentRound={currentRound}
              currentId={current?.entryId}
              drafts={drafts}
              onSelect={open}
            />
          </div>
          {pastForm ? (
            pastForm
          ) : current ? (
            <StarterForm
              key={current.entryId}
              slot={current}
              slots={slots}
              drafts={drafts}
              fromReview={resolved.fromReview}
              takeFocus={resolved.takeFocus}
              onMove={(view) => moveTo(view)}
            />
          ) : (
            <Review
              key={currentRound}
              slots={slots}
              drafts={drafts}
              confirmation={{
                isConfirming: confirmation.isConfirming,
                error: confirmation.round === currentRound ? confirmation.error : null,
                missing: confirmation.missing,
                confirm: () => void confirm(),
              }}
              onEdit={(entryId) => moveTo(entryId, true)}
            />
          )}
        </div>
        <aside className="sticky top-24 hidden max-h-[calc(100svh-7rem)] overflow-y-auto rounded-xl border bg-card p-2 @5xl:block">
          <h2 className="mt-1 mb-2 px-2 font-display text-xl">{t('list.current')}</h2>
          <StarterList slots={slots} drafts={drafts} currentId={current?.entryId} onSelect={open} />
        </aside>
      </div>
    </div>
  );
}
