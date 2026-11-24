import { CheckIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import type { TabletRound, TabletSlot } from '~/components/judging/types';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useApparatusName } from '~/hooks/useApparatusName';
import { cn } from '~/lib/utils';
import { GradingRow } from './GradingRow';
import type { GradeDrafts } from './useGradeDrafts';

type Apparatus = {
  apparatus: string;
  /** Null when all rounds are confirmed. */
  currentRound: number | null;
  /** The divisions to confirm the current round for. */
  divisionIds: readonly string[];
  rounds: readonly TabletRound[];
};

/** Who is on each apparatus of a ground, in starting order. Follows the current rounds until one is chosen. */
export function RoundBoard({
  ground,
  apparatus,
  drafts,
  canEdit,
}: {
  ground: number;
  apparatus: readonly Apparatus[];
  drafts: GradeDrafts;
  canEdit: boolean;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const [chosen, setChosen] = useState<number | null>(null);
  /** The round last typed in, by apparatus. */
  const [edited, setEdited] = useState<Record<string, number>>({});

  const isDirty = (slot: TabletSlot) => drafts.get(slot).isDirty;
  const roundCount = Math.max(...apparatus.map(({ rounds }) => rounds.length));
  const firstRound = Math.min(
    ...apparatus.map(({ currentRound, rounds }) => currentRound ?? rounds.length),
  );

  function getShown({ apparatus: key, currentRound, rounds }: Apparatus) {
    if (chosen !== null) return chosen;
    // Rows that are being edited must not be replaced by the next round.
    if (rounds[edited[key]]?.slots.some(isDirty)) return edited[key];
    return currentRound ?? rounds.length - 1;
  }

  /** Inputs in this round that are not on the page. */
  function countHidden(round: number) {
    return apparatus
      .filter((item) => getShown(item) !== round)
      .flatMap(({ rounds }) => rounds[round]?.slots ?? [])
      .filter(isDirty).length;
  }

  return (
    <div className="grid gap-4">
      <div
        role="group"
        aria-label={t('grading.rounds')}
        className="flex w-fit flex-wrap gap-1 rounded-lg border bg-card p-1"
      >
        <RoundButton isChosen={chosen === null} onClick={() => setChosen(null)}>
          {t('grading.current')}
        </RoundButton>
        {Array.from({ length: roundCount }, (_, round) => {
          const hidden = countHidden(round);
          return (
            <RoundButton
              key={round}
              isChosen={chosen === round}
              label={[
                t('common:round', { number: round + 1 }),
                ...(hidden > 0 ? [t('grading.unsavedCount', { count: hidden })] : []),
              ].join(', ')}
              onClick={() => setChosen(round)}
            >
              {round + 1}
              {hidden > 0 && <Badge variant="destructive">{hidden}</Badge>}
            </RoundButton>
          );
        })}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-4">
        {apparatus.map((item) => {
          const round = getShown(item);
          return (
            <ApparatusCard
              key={item.apparatus}
              ground={ground}
              item={item}
              round={round}
              isAhead={item.currentRound !== null && item.currentRound > firstRound}
              drafts={drafts}
              canEdit={canEdit}
              onEdit={() => setEdited((before) => ({ ...before, [item.apparatus]: round }))}
            />
          );
        })}
      </div>
    </div>
  );
}

function RoundButton({
  isChosen,
  label,
  onClick,
  children,
}: {
  isChosen: boolean;
  label?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isChosen}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-[3px] pointer-coarse:h-11 pointer-coarse:min-w-11',
        isChosen &&
          'bg-ink text-ink-foreground hover:bg-ink dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary',
      )}
    >
      {children}
    </button>
  );
}

function ApparatusCard({
  ground,
  item: { apparatus, currentRound, divisionIds, rounds },
  round,
  isAhead,
  drafts,
  canEdit,
  onEdit,
}: {
  ground: number;
  item: Apparatus;
  round: number;
  /** Its current round is after the one of another apparatus. */
  isAhead: boolean;
  drafts: GradeDrafts;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation(['judging', 'common', 'competition']);
  const name = useApparatusName()(apparatus);
  const slots = rounds[round]?.slots ?? [];
  const isCurrent = round === currentRound;
  const active = slots.filter(({ withdrawn }) => !withdrawn);
  const graded = active.filter((slot) => {
    const { saved, isDirty } = drafts.get(slot);
    return saved !== null && !isDirty;
  }).length;
  const next = isCurrent ? active.find((slot) => drafts.get(slot).saved === null) : undefined;

  return (
    <section
      aria-label={name}
      onChange={onEdit}
      className="flex flex-col overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b px-4 py-3">
        <h2 className="text-lg font-bold">{name}</h2>
        <p className="text-sm text-muted-foreground">
          {currentRound === null
            ? t('grading.finished')
            : isCurrent && isAhead
              ? t('competition:dashboard.roundFollows', { round: round + 1 })
              : t('common:round', { number: round + 1 })}
        </p>
      </div>
      {slots.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground">{t('grading.nobody')}</p>
      ) : (
        <ol className="divide-y border-b">
          {slots.map((slot, index) => (
            <GradingRow
              key={slot.entryId}
              slot={slot}
              position={index + 1}
              isNext={slot.entryId === next?.entryId}
              drafts={drafts}
              canEdit={canEdit}
            />
          ))}
        </ol>
      )}
      {/* As high as with the button, so that nothing moves when it appears. */}
      <div className="mt-auto flex min-h-16 flex-wrap items-center justify-between gap-2 px-4 py-2">
        <span className="text-sm text-muted-foreground tabular-nums">
          {active.length > 0 &&
            t('competition:dashboard.gradedOf', { graded, total: active.length })}
        </span>
        {canEdit && isCurrent && graded === active.length && (
          <ConfirmDialog
            // A dialog that is open must not become the one of the next round.
            key={[round, ...divisionIds].join(' ')}
            trigger={
              <Button variant="outline">
                <CheckIcon aria-hidden />
                {t('grading.confirmRound', { number: round + 1 })}
              </Button>
            }
            title={t('grading.confirmTitle', { number: round + 1 })}
            description={t('grading.confirmText', { apparatus: name })}
            confirmLabel={t('common:actions.confirm')}
            fields={{
              intent: 'confirm',
              ground: String(ground),
              apparatus,
              round: String(round),
              divisionIds: [...divisionIds],
            }}
          />
        )}
      </div>
    </section>
  );
}
