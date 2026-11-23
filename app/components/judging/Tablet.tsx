import { CircleCheckBigIcon, HourglassIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRevalidator } from 'react-router';
import type { Draft } from '~/components/grading/draftStore';
import { useGradeDrafts } from '~/components/grading/useGradeDrafts';
import { EmptyState } from '~/components/EmptyState';
import type { ConnectionStatus } from '~/hooks/useLiveUpdates';
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
  status,
}: {
  linkId: string;
  /** Where grades are sent. */
  url: string;
  data: TabletData;
  status: ConnectionStatus;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const { revalidate } = useRevalidator();
  const { currentRound, rounds } = data;
  const allSlots = useMemo(() => rounds.flatMap(({ slots }) => slots), [rounds]);
  const drafts = useGradeDrafts({
    url,
    prefix: `grade:${linkId}`,
    slots: allSlots,
    loadedAt: data.loadedAt,
    status,
  });

  const [changes, setChanges] = useState({ data, notices: [] as Notice[], hasEnded: false });
  if (changes.data !== data) {
    setChanges({
      data,
      notices: mergeNotices(changes.notices, getNotices(changes.data, data)),
      hasEnded: data.status === 'WAITING' && (changes.hasEnded || hasJustEnded(changes.data, data)),
    });
  }

  const [position, setPosition] = useState<Position | null>(null);
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
  // Kept, so the judge stays at a starter whose grade arrives from elsewhere.
  if (resolved !== position) setPosition(resolved);

  const current = slots.find(({ entryId }) => entryId === resolved?.view);
  const unsaved = [...drafts.drafts.values()].filter(
    (draft) => !draft.confirmed && draft.entryId !== current?.entryId,
  );

  function moveTo(view: string, fromReview = false) {
    if (currentRound !== null) setPosition({ round: currentRound, view, fromReview });
  }

  function opener({ entryId }: Draft) {
    return slots.some((slot) => slot.entryId === entryId && !slot.withdrawn)
      ? () => moveTo(entryId, resolved?.view === 'review')
      : null;
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
    if (result.ok || result.code !== 'OFFLINE') await revalidate();
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
  const unsavedGrades = <UnsavedGrades items={unsaved} drafts={drafts} onOpen={opener} />;

  if (currentRound === null || !resolved) {
    const isFinished = data.status === 'FINISHED' || changes.hasEnded;
    return (
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4">
        {notices}
        {unsavedGrades}
        <div role="status" className="text-xl">
          {isFinished ? (
            <EmptyState
              icon={CircleCheckBigIcon}
              title={<span className="text-4xl font-black">{t('finished.title')}</span>}
              text={t('finished.text')}
            />
          ) : (
            <EmptyState
              icon={HourglassIcon}
              title={<span className="text-4xl font-black">{t('waiting.title')}</span>}
              text={t('waiting.text')}
            />
          )}
        </div>
        {rounds.length > 0 && (
          <div className="flex justify-center">
            <RoundsSheet rounds={rounds} currentRound={null} drafts={drafts} onSelect={() => {}} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 grid-cols-1 gap-4">
        {notices}
        {unsavedGrades}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-bold">
            {t('roundOf', { number: currentRound + 1, total: rounds.length })}
            <span className="ml-3 font-normal text-muted-foreground">
              {data.divisions
                .filter(({ id }) => data.divisionIds.includes(id))
                .map(({ category, sex, number }) => `${category} ${t(`sexShort.${sex}`)} ${number}`)
                .join(', ')}
            </span>
          </p>
          <RoundsSheet
            rounds={rounds}
            currentRound={currentRound}
            currentId={current?.entryId}
            drafts={drafts}
            onSelect={(entryId) => moveTo(entryId, resolved.view === 'review')}
          />
        </div>
        {current ? (
          <StarterForm
            key={current.entryId}
            slot={current}
            slots={slots}
            drafts={drafts}
            fromReview={resolved.fromReview}
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
      <aside className="sticky top-24 hidden max-h-[calc(100svh-7rem)] overflow-y-auto rounded-xl border bg-card p-3 lg:block">
        <h2 className="mb-2 px-2 text-lg font-bold">{t('list.current')}</h2>
        <StarterList
          slots={slots}
          drafts={drafts}
          currentId={current?.entryId}
          onSelect={(entryId) => moveTo(entryId, resolved.view === 'review')}
        />
      </aside>
    </div>
  );
}
