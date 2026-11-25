import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { ArrowDownToLineIcon, ChevronDownIcon, GripVerticalIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { categoryName } from '~/lib/categoryName';
import { cn } from '~/lib/utils';
import {
  chooseLineup,
  groupClubs,
  isSameCategory,
  type ClubMove,
  type DescribedDivision,
  type LineupRef,
} from './proposal';
import { useDivisionName } from './useDivisionName';

type Apparatus = keyof (typeof import('~/locales/de/common'))['default']['apparatus'];

type Club = ReturnType<typeof groupClubs>[number];

type Dragged = { club: Club; from: LineupRef; division: DescribedDivision };

type OnMenuMove = (move: ClubMove, name: string) => void;

/** A lineup, or a division that chooses it. */
type DropTarget = { division: DescribedDivision; apparatus?: string };

/** Prefers the lineup below the pointer over its division. */
const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const isLineup = (id: UniqueIdentifier) => {
    const target = args.droppableContainers.find((item) => item.id === id)?.data.current;
    return (target as DropTarget | undefined)?.apparatus !== undefined;
  };
  const lineup = hits.find(({ id }) => isLineup(id));
  return lineup ? [lineup] : hits;
};

/** The proposed divisions. Clubs are moved to other lineups of their category. */
export function ProposalBoard({
  divisions,
  grounds,
  maxSize,
  onMove,
}: {
  divisions: DescribedDivision[];
  /** Those to show. */
  grounds: number[];
  maxSize: number;
  onMove: (move: ClubMove) => void;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const dndId = useId();
  const divisionTitle = useDivisionTitle();
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragged(null);
    const target = over?.data.current as DropTarget | undefined;
    const { club, from } = active.data.current as Partial<Dragged>;
    // A live update may have removed it.
    if (!target || !club || !from) return;
    const { division, apparatus = chooseLineup(division, club, maxSize) } = target;
    const to: LineupRef = { division: division.key, apparatus };
    if (!isSameLineup(from, to)) onMove({ clubId: club.clubId, from, to });
  }

  function announce(active: Active, key: 'start' | 'end') {
    const { club } = active.data.current as Partial<Dragged>;
    return club && t(`order.${key}`, { name: club.clubName });
  }

  /** The club is in another place afterwards, with a new button. */
  function moveWithMenu(move: ClubMove, name: string) {
    onMove(move);
    const target = divisions.find(({ key }) => key === move.to.division);
    const apparatus = t(`common:apparatus.${move.to.apparatus as Apparatus}`);
    const place = target && `${divisionTitle(target)}, ${apparatus}`;
    setAnnouncement(t('proposal.moved', { name, place }));
    setFocusId(getChipId(move.clubId, move.to));
  }

  useEffect(() => {
    if (!focusId) return;
    // Not before the menu has closed.
    const timeout = setTimeout(() => {
      document.getElementById(focusId)?.focus();
      setFocusId(null);
    });
    return () => clearTimeout(timeout);
  }, [focusId]);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      accessibility={{
        // The keyboard uses the menu.
        screenReaderInstructions: { draggable: '' },
        announcements: {
          onDragStart: ({ active }) => announce(active, 'start'),
          onDragOver: () => undefined,
          onDragEnd: ({ active }) => announce(active, 'end'),
          onDragCancel: ({ active }) => announce(active, 'end'),
        },
      }}
      collisionDetection={collisions}
      onDragStart={({ active }) => setDragged(active.data.current as Dragged)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      {grounds.map((ground) => {
        const own = divisions.filter((division) => division.ground === ground);
        return (
          <section key={ground} aria-label={t('common:ground', { number: ground })}>
            <h2 className="mb-2 flex items-baseline justify-between gap-3 text-lg font-semibold">
              {t('common:ground', { number: ground })}
              <span className="text-sm font-normal text-muted-foreground">
                {t('count', { count: own.filter(({ isEmpty }) => !isEmpty).length })}
              </span>
            </h2>
            <ol className="divide-y overflow-hidden rounded-xl border bg-card">
              {own.map((division) => (
                <DivisionItem
                  key={division.key}
                  division={division}
                  category={divisions.filter((other) => isSameCategory(other, division))}
                  maxSize={maxSize}
                  dragged={dragged}
                  onMove={moveWithMenu}
                />
              ))}
              {own.length === 0 && (
                <li className="px-4 py-2.5 text-muted-foreground">{t('order.emptyGround')}</li>
              )}
            </ol>
          </section>
        );
      })}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="w-max max-w-72 truncate rounded-lg border bg-popover px-3 py-2 text-sm font-semibold shadow-lg">
            {dragged.club.clubName} ({dragged.club.count})
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function DivisionItem({
  division,
  category,
  maxSize,
  dragged,
  onMove,
}: {
  division: DescribedDivision;
  /** All divisions of the category. */
  category: DescribedDivision[];
  maxSize: number;
  dragged: Dragged | null;
  onMove: OnMenuMove;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const divisionName = useDivisionName();
  const divisionTitle = useDivisionTitle();
  const { lineups, number, together, split, clashes } = division;
  const count = lineups.reduce((sum, { members }) => sum + members.length, 0);
  const isTarget = dragged !== null && isSameCategory(dragged.division, division);
  // Its own division has nothing to choose.
  const canDrop = isTarget && dragged.from.division !== division.key;
  const target: DropTarget = { division };
  const { setNodeRef, isOver } = useDroppable({
    id: division.key,
    data: target,
    disabled: !canDrop,
  });

  const splitTexts = split.map((club) => {
    const parts = club.lineups.map((lineup) => {
      const text = `${t(`common:apparatus.${lineup.apparatus as Apparatus}`)} ${lineup.count}`;
      return lineup.number === number ? text : `${t('number', { number: lineup.number })}: ${text}`;
    });
    return `${club.clubName} (${parts.join(', ')})`;
  });

  return (
    <li
      ref={setNodeRef}
      className={cn('px-4 py-3', isOver && 'bg-accent outline-2 -outline-offset-2 outline-primary')}
    >
      <div
        className={cn(
          '-mx-2 mb-2 flex min-h-10 flex-wrap items-center justify-between gap-x-3 rounded-lg px-2',
          canDrop && 'outline-2 -outline-offset-2 outline-primary outline-dashed',
          isOver && 'bg-primary text-primary-foreground',
        )}
      >
        <span className="font-semibold">{divisionTitle(division)}</span>
        {canDrop ? (
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <ArrowDownToLineIcon aria-hidden className="size-4" />
            {t('proposal.drop')}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {division.isEmpty ? t('proposal.notCreated') : t('common:starterCount', { count })}
          </span>
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {lineups.map(({ apparatus, members }) => (
          <Lineup
            key={apparatus}
            division={division}
            apparatus={apparatus}
            clubs={groupClubs(members)}
            size={members.length}
            category={category}
            maxSize={maxSize}
            isTarget={isTarget}
            onMove={onMove}
          />
        ))}
      </ul>
      <div className="mt-2 grid gap-0.5 text-sm text-muted-foreground empty:hidden">
        {together.length > 0 && (
          <p className="text-foreground">
            {t('proposal.together', { divisions: together.map(divisionName).join('; ') })}
          </p>
        )}
        {splitTexts.length > 0 && <p>{t('proposal.split', { clubs: splitTexts.join('; ') })}</p>}
        {clashes.length > 0 && <p>{t('proposal.clashes', { clubs: clashes.join(', ') })}</p>}
      </div>
    </li>
  );
}

function Lineup({
  division,
  apparatus,
  clubs,
  size,
  category,
  maxSize,
  isTarget,
  onMove,
}: {
  division: DescribedDivision;
  apparatus: string;
  clubs: Club[];
  size: number;
  category: DescribedDivision[];
  maxSize: number;
  /** Something that may go here is being dragged. */
  isTarget: boolean;
  onMove: OnMenuMove;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const ref: LineupRef = { division: division.key, apparatus };
  const target: DropTarget = { division, apparatus };
  const { setNodeRef, isOver } = useDroppable({
    id: `${division.key} ${apparatus}`,
    data: target,
    disabled: !isTarget,
  });

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'min-w-0 rounded-lg bg-muted p-2',
        isTarget && 'outline-1 outline-input outline-dashed',
        isTarget && isOver && 'bg-accent outline-2 outline-primary',
      )}
    >
      <p className="mb-1 flex items-baseline justify-between gap-2 px-1 text-sm">
        <span className="truncate">{t(`common:apparatus.${apparatus as Apparatus}`)}</span>
        <span className="shrink-0">
          {size > maxSize && (
            <span className="mr-1.5 text-xs text-destructive">
              {t('proposal.tooLarge', { max: maxSize })}
            </span>
          )}
          <span className="figure">{size}</span>
        </span>
      </p>
      {clubs.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">{t('lineups.emptyLineup')}</p>
      )}
      <ul className="grid gap-1">
        {clubs.map((club) => (
          <ClubChip
            key={club.clubId}
            club={club}
            from={ref}
            division={division}
            category={category}
            maxSize={maxSize}
            onMove={onMove}
          />
        ))}
      </ul>
    </li>
  );
}

function ClubChip({
  club,
  from,
  division,
  category,
  maxSize,
  onMove,
}: Dragged & {
  category: DescribedDivision[];
  maxSize: number;
  onMove: OnMenuMove;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const data: Dragged = { club, from, division };
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `${club.clubId} ${from.division} ${from.apparatus}`,
    data,
  });
  const label = `${club.clubName} (${club.count})`;
  const divisionNumber = ({ isEmpty, number }: DescribedDivision) =>
    isEmpty ? t('proposal.emptyDivision') : t('number', { number });
  const moveTo = (to: LineupRef) => onMove({ clubId: club.clubId, from, to }, club.clubName);

  return (
    <li
      ref={setNodeRef}
      className={cn('flex min-w-0 rounded-md border bg-card', isDragging && 'opacity-40')}
    >
      {/* The menu does the same for the keyboard and screen readers. */}
      <span
        {...listeners}
        aria-hidden
        className="flex w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground pointer-coarse:w-11"
      >
        <GripVerticalIcon className="size-4" />
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id={getChipId(club.clubId, from)}
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-h-8 min-w-0 flex-1 justify-between gap-1 px-1 py-1 text-left font-normal whitespace-normal pointer-coarse:min-h-11"
            aria-label={t('proposal.move', { name: label })}
          >
            <span className="min-w-0 wrap-anywhere">{label}</span>
            <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          {category.map((target) => (
            <div
              key={target.key}
              role="group"
              aria-label={divisionNumber(target)}
              className="not-first:mt-1 not-first:border-t not-first:pt-1"
            >
              <DropdownMenuLabel className="font-bold">{divisionNumber(target)}</DropdownMenuLabel>
              {target.key !== from.division && (
                <DropdownMenuItem
                  className="pl-5"
                  onSelect={() => {
                    const apparatus = chooseLineup(target, club, maxSize);
                    moveTo({ division: target.key, apparatus });
                  }}
                >
                  {t('proposal.automatic')}
                </DropdownMenuItem>
              )}
              {target.lineups.map(({ apparatus, members }) => {
                const to: LineupRef = { division: target.key, apparatus };
                return (
                  <DropdownMenuItem
                    key={apparatus}
                    className="pl-5"
                    disabled={isSameLineup(from, to)}
                    onSelect={() => moveTo(to)}
                  >
                    {t(`common:apparatus.${apparatus as Apparatus}`)} ({members.length})
                  </DropdownMenuItem>
                );
              })}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Empty divisions are not created and have no number. */
function useDivisionTitle() {
  const { t } = useTranslation(['divisions', 'common']);
  const divisionName = useDivisionName();
  return (division: DescribedDivision) =>
    division.isEmpty
      ? `${categoryName(division.category, t)} ${t(`common:sex.${division.sex}`)}, ${t('proposal.emptyDivision')}`
      : divisionName(division);
}

function getChipId(clubId: string, { division, apparatus }: LineupRef) {
  return `${clubId} ${division} ${apparatus}`.replaceAll(' ', '-');
}

function isSameLineup(a: LineupRef, b: LineupRef) {
  return a.division === b.division && a.apparatus === b.apparatus;
}
