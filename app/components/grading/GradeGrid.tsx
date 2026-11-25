import {
  EllipsisVerticalIcon,
  LoaderCircleIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UndoIcon,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { fullName, type TabletRound, type TabletSlot } from '~/components/judging/types';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  Table,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { useApparatusName } from '~/hooks/useApparatusName';
import { roundGrade } from '~/lib/domain/grade';
import { evaluateFields, formatEntered } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import { GradeInputs } from './GradeInputs';
import { ConflictNotice, RejectedNotice } from './SaveState';
import { draftKey, isUntouched, type Draft, type GradeDrafts } from './useGradeDrafts';
import { findInput, useGradeEditing } from './useGradeEditing';

type ApparatusRounds = { apparatus: string; rounds: readonly TabletRound[] };
type Stage = 'done' | 'now' | 'later';

/** Next to the fields, where it moves nothing. */
const MARK = 'absolute top-1/2 right-0 size-3.5 -translate-y-1/2 text-muted-foreground';

/** All grades of a division: a row per starter, grouped by lineup, and a column per apparatus. */
export function GradeGrid({
  apparatus,
  progress,
  isRunning,
  drafts,
  canEdit,
  confirm,
}: {
  apparatus: ApparatusRounds[];
  /** Confirmed rounds by apparatus. */
  progress: Record<string, number>;
  isRunning: boolean;
  drafts: GradeDrafts;
  canEdit: boolean;
  /** Below a column, to confirm the round of the apparatus. */
  confirm?: (apparatus: string) => ReactNode;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const apparatusName = useApparatusName();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const cells = new Map(
    apparatus.flatMap(({ apparatus: key, rounds }) =>
      rounds.flatMap(({ round, slots }) =>
        slots.map((slot) => [draftKey(slot), { slot, stage: getStage(key, round) }] as const),
      ),
    ),
  );
  // Who is on an apparatus in the first round starts there.
  const lineups = apparatus
    .map(({ apparatus: key, rounds }) => ({ apparatus: key, starters: rounds[0]?.slots ?? [] }))
    .filter(({ starters }) => starters.length > 0);

  function getStage(key: string, round: number): Stage {
    const completed = progress[key] ?? 0;
    if (round < completed) return 'done';
    return isRunning && round === completed ? 'now' : 'later';
  }

  /** Where a lineup is now. Two, when one apparatus is ahead of the others. */
  function getCurrent(starter: TabletSlot) {
    return apparatus
      .filter(
        ({ apparatus: key }) =>
          cells.get(draftKey({ ...starter, apparatus: key }))?.stage === 'now',
      )
      .map(({ apparatus: key }) => apparatusName(key))
      .join(', ');
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-[1] min-w-36 bg-muted">
                {t('common:fields.name')}
              </TableHead>
              {apparatus.map(({ apparatus: key }) => (
                <TableHead key={key}>{apparatusName(key)}</TableHead>
              ))}
              <TableHead className="text-right">{t('grading.sum')}</TableHead>
              {canEdit && (
                <TableHead className="w-12">
                  <span className="sr-only">{t('grading.more')}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          {lineups.map(({ apparatus: start, starters }) => {
            const current = getCurrent(starters[0]);
            return (
              <tbody key={start} className="border-b last:border-b-0">
                <tr className="border-b bg-muted/60">
                  <th
                    scope="rowgroup"
                    colSpan={apparatus.length + (canEdit ? 3 : 2)}
                    className="px-3 py-2 text-left font-semibold"
                  >
                    <span className="sticky left-3">
                      {t('grading.lineup', { apparatus: apparatusName(start) })}
                      {current && (
                        <span className="ml-3 font-normal text-muted-foreground">
                          {t('grading.now', { apparatus: current })}
                        </span>
                      )}
                    </span>
                  </th>
                </tr>
                {starters.map((starter) => (
                  <StarterRow
                    key={starter.entryId}
                    starter={starter}
                    cells={apparatus.flatMap(
                      ({ apparatus: key }) =>
                        cells.get(draftKey({ ...starter, apparatus: key })) ?? [],
                    )}
                    drafts={drafts}
                    canEdit={canEdit}
                    onActiveChange={setActiveKey}
                  />
                ))}
              </tbody>
            );
          })}
          {confirm && (
            <TableFooter>
              <TableRow>
                <TableHead scope="row" className="sticky left-0 z-[1] bg-muted">
                  {t('grading.confirmRow')}
                </TableHead>
                {apparatus.map(({ apparatus: key }) => (
                  <TableCell key={key}>{confirm(key)}</TableCell>
                ))}
                <TableCell colSpan={canEdit ? 2 : 1} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {canEdit && <Unsaved drafts={drafts} slots={cells} activeKey={activeKey} />}
    </>
  );
}

function StarterRow({
  starter,
  cells,
  drafts,
  canEdit,
  onActiveChange,
}: {
  starter: TabletSlot;
  cells: { slot: TabletSlot; stage: Stage }[];
  drafts: GradeDrafts;
  canEdit: boolean;
  /** The draft key of the cell with the focus. */
  onActiveChange: (key: string | null) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const apparatusName = useApparatusName();
  const row = useRef<HTMLTableRowElement>(null);
  const name = fullName(starter);
  const isEditable = canEdit && !starter.withdrawn;
  const states = cells.map(({ slot }) => ({ slot, state: drafts.get(slot) }));
  // Rounded like in the ranking.
  const saved = states.flatMap(({ slot, state }) =>
    state.saved ? roundGrade(state.saved.value, slot.precision) : [],
  );

  return (
    // Other pages link to it.
    <tr
      ref={row}
      id={starter.entryId}
      className="group/starter scroll-my-24 border-b last:border-b-0"
    >
      <th
        scope="row"
        className="sticky left-0 z-[1] bg-card px-3 py-2 text-left font-normal group-target/starter:bg-accent group-target/starter:shadow-[inset_3px_0_0_var(--primary)]"
      >
        <span className={cn('block font-semibold', starter.withdrawn && 'line-through')}>
          {name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {starter.withdrawn ? t('withdrawn') : starter.clubName}
        </span>
      </th>
      {cells.map(({ slot, stage }) => (
        <GradeCell
          key={slot.apparatus}
          slot={slot}
          stage={stage}
          drafts={drafts}
          isEditable={isEditable}
          onActiveChange={(isActive) => onActiveChange(isActive ? draftKey(slot) : null)}
        />
      ))}
      <td className="figure px-3 py-2 text-right text-base">
        {saved.length > 0 && formatEntered(saved.reduce((sum, value) => sum + value, 0))}
      </td>
      {canEdit && (
        <td className="px-1">
          {isEditable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={saved.length === 0}
                  aria-label={t('grading.moreFor', { name })}
                >
                  <EllipsisVerticalIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {states.map(
                  ({ slot, state }) =>
                    state.saved && (
                      <DropdownMenuItem
                        key={slot.apparatus}
                        variant="destructive"
                        disabled={state.isDirty}
                        onSelect={() =>
                          row.current
                            ?.querySelector<HTMLElement>(
                              `[data-apparatus="${slot.apparatus}"] [data-delete]`,
                            )
                            ?.click()
                        }
                      >
                        <Trash2Icon aria-hidden />
                        {t('grading.deleteOn', {
                          apparatus: apparatusName(slot.apparatus),
                          grade: formatEntered(state.saved.value),
                        })}
                      </DropdownMenuItem>
                    ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </td>
      )}
    </tr>
  );
}

/**
 * Grades that were not saved and have to be decided on, also of starters the grid no longer has.
 * Below the grid, where nothing moves while typing.
 */
function Unsaved({
  drafts,
  slots,
  activeKey,
}: {
  drafts: GradeDrafts;
  slots: ReadonlyMap<string, { slot: TabletSlot }>;
  activeKey: string | null;
}) {
  const open = [...drafts.drafts].filter(([key, draft]) => {
    if (isUntouched(draft)) return false;
    const slot = slots.get(key)?.slot;
    // These are sent by themselves.
    if (!slot) return !draft.saving && !draft.queued;
    const state = drafts.get(slot);
    if (state.isConflict || state.rejected) return true;
    return state.isDirty && !state.isSaving && !state.isWaiting && key !== activeKey;
  });
  if (open.length === 0) return null;

  return (
    <ul className="divide-y rounded-xl border border-warning bg-[color-mix(in_oklab,var(--warning)_14%,var(--card))]">
      {open.map(([key, draft]) => (
        <li key={key} className="px-4 py-3">
          <Notice draft={draft} slot={slots.get(key)?.slot} drafts={drafts} />
        </li>
      ))}
    </ul>
  );
}

function Notice({ draft, slot, drafts }: { draft: Draft; slot?: TabletSlot; drafts: GradeDrafts }) {
  const { t } = useTranslation(['judging', 'common']);
  const apparatus = useApparatusName()(draft.apparatus);
  const state = slot && drafts.get(slot);
  const key = draftKey(draft);
  const name = `${draft.name}, ${apparatus}`;
  const { grade } = evaluateFields(draft.fields, draft.inputRule);
  const rejected = state ? state.rejected : draft.rejected;

  function discard() {
    if (!draft.sent || window.confirm(t('discardSent', { name }))) drafts.discard(key);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          <span className="font-semibold">{name}:</span>{' '}
          <span className="tabular-nums">
            {grade ? formatEntered(grade.value) : t('save.unfinished')}
          </span>
        </span>
        <span className="text-sm">{t('save.unsaved')}</span>
        {!state?.isConflict && (
          <span className="flex gap-2">
            {/* Typed before a reload, or refused: that does not save by itself. */}
            {slot && !slot.withdrawn && grade && (
              <Button
                size="sm"
                aria-label={t('grading.saveRow', { name })}
                onClick={() => void drafts.submit(key)}
              >
                <SaveIcon aria-hidden />
                {t('common:actions.save')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              aria-label={t('grading.discardRow', { name })}
              onClick={discard}
            >
              <UndoIcon aria-hidden />
              {t('discard')}
            </Button>
          </span>
        )}
      </div>
      {state?.isConflict && (
        <ConflictNotice
          state={state}
          onUseSaved={() => drafts.discard(key)}
          onUseOwn={() => void drafts.overwrite(key, state.saved)}
        />
      )}
      {rejected && <RejectedNotice code={rejected} />}
    </div>
  );
}

function GradeCell({
  slot,
  stage,
  drafts,
  isEditable,
  onActiveChange,
}: {
  slot: TabletSlot;
  stage: Stage;
  drafts: GradeDrafts;
  isEditable: boolean;
  onActiveChange: (isActive: boolean) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  const apparatus = useApparatusName()(slot.apparatus);
  const cell = useRef<HTMLTableCellElement>(null);
  const { state, showRequired, change, goToNext, handlers } = useGradeEditing({
    slot,
    drafts,
    element: cell,
    findNext,
    onActiveChange,
  });
  /** The grade in the open delete dialog, also when another one is saved meanwhile. */
  const [shown, setShown] = useState(state.saved);
  const name = fullName(slot);

  /** The same apparatus of the next one in the lineup. */
  function findNext() {
    let row = cell.current?.parentElement?.nextElementSibling;
    while (row) {
      const input = findInput(row.querySelector(`[data-apparatus="${slot.apparatus}"]`));
      if (input) return input;
      row = row.nextElementSibling;
    }
    return null;
  }

  return (
    // Only passes on what happens in the fields.
    <td
      ref={cell}
      data-apparatus={slot.apparatus}
      {...handlers}
      className={cn(
        'relative px-3 py-1.5 align-middle',
        stage === 'now' && 'bg-brand/15',
        stage === 'later' && 'bg-muted/50',
        state.isDirty && 'bg-warning/25',
      )}
    >
      {stage === 'now' && (
        <>
          <span aria-hidden className="absolute top-1 left-1 size-1.5 rounded-full bg-brand" />
          <span className="sr-only">{t('grading.stage.now')}</span>
        </>
      )}
      {isEditable ? (
        <>
          <GradeInputs
            fields={state.fields}
            evaluated={state.evaluated}
            rule={slot.inputRule}
            name={`${name}, ${apparatus}`}
            showRequired={showRequired}
            compact
            onChange={change}
            onSubmit={goToNext}
          />
          {state.isSaving ? (
            <LoaderCircleIcon aria-hidden className={cn(MARK, 'animate-spin')} />
          ) : (
            state.isWaiting && (
              <TriangleAlertIcon
                aria-label={t('save.waiting')}
                className={cn(MARK, 'text-destructive')}
              />
            )
          )}
          <ConfirmDialog
            destructive
            trigger={
              // Opened with the keys or from the menu of the row.
              <button
                type="button"
                data-delete
                disabled={!state.saved}
                tabIndex={-1}
                className="sr-only"
                onClick={() => setShown(state.saved)}
              >
                {t('grading.deleteRow', { name: `${name}, ${apparatus}` })}
              </button>
            }
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              findInput(cell.current)?.focus();
            }}
            title={t('grading.deleteTitle')}
            description={t('grading.deleteText', {
              name,
              grade: shown ? formatEntered(shown.value) : '',
              apparatus,
            })}
            confirmLabel={t('common:actions.delete')}
            fields={{
              intent: 'delete',
              entryId: slot.entryId,
              apparatus: slot.apparatus,
              version: String(shown?.version),
            }}
          />
        </>
      ) : (
        <span className="figure text-base">
          {state.saved ? formatEntered(state.saved.value) : '–'}
        </span>
      )}
    </td>
  );
}
