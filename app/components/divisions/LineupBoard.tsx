import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVerticalIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { cn } from '~/lib/utils';
import { entryName, LineupEntry, type LineupEntryData } from './LineupEntry';
import { applyMove, findColumn, stepMove, UNASSIGNED, type Column, type Move } from './lineupMoves';

/** Prefers the entry next to the pointer over the column around it. */
const collisionDetection: CollisionDetection = (args) => {
  const isColumn = (id: unknown) =>
    args.droppableContainers.some(
      (container) => container.id === id && container.data.current?.isColumn,
    );
  const hits = pointerWithin(args);
  // Without a pointer, i.e. with the keyboard.
  if (hits.length === 0) return closestCorners(args);
  const column = hits.find(({ id }) => isColumn(id));
  if (!column) return hits;
  const entries = args.droppableContainers.filter(
    ({ data }) => data.current?.sortable?.containerId === column.id,
  );
  return entries.length > 0 ? closestCenter({ ...args, droppableContainers: entries }) : [column];
};

export function LineupBoard({
  entries,
  columns: savedColumns,
  columnName,
  clubId,
  canEdit,
  onMove,
}: {
  entries: LineupEntryData[];
  columns: Column[];
  columnName: (columnId: string) => string;
  /** Only show entries of this club. */
  clubId: string | null;
  canEdit: boolean;
  onMove: (move: Move) => void;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const dndId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Where the dragged entry currently is, to show the gap in other columns.
  const [dragMove, setDragMove] = useState<Move | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const focusAfterDrop = useRef<string | null>(null);
  useEffect(() => {
    // In another column it is a new element, which dnd-kit does not focus.
    if (activeId !== null || focusAfterDrop.current === null) return;
    document.querySelector<HTMLElement>(`[data-entry="${focusAfterDrop.current}"] button`)?.focus();
    focusAfterDrop.current = null;
  }, [activeId]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const columns = dragMove ? applyMove(savedColumns, dragMove) : savedColumns;
  const selected = entries
    .filter((entry) => selection.has(entry.id) && !entry.withdrawn && isShown(entry.id))
    .map(({ id }) => id);

  function isShown(id: string) {
    const entry = byId.get(id);
    // The dragged one could disappear when others change the division.
    return entry !== undefined && (!clubId || entry.clubId === clubId);
  }

  function shownIds(column: Column) {
    return column.entryIds.filter(isShown);
  }

  function select(ids: string[], isSelected: boolean) {
    setSelection((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (isSelected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function moveSelection(columnId: string) {
    // In the order they are shown, whatever the order of selecting.
    const entryIds = columns.flatMap(shownIds).filter((id) => selected.includes(id));
    onMove({ entryIds, columnId });
    setSelection(new Set());
  }

  function columnAt(id: string) {
    return columns.find((column) => column.id === id) ?? findColumn(columns, id);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const id = String(active.id);
    const target = columnAt(String(over.id));
    if (!target || target.id === findColumn(columns, id)?.id) return;

    const shown = shownIds(target);
    const overIndex = shown.indexOf(String(over.id));
    const rect = active.rect.current.translated;
    const isBelow = rect && rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2;
    setDragMove({
      entryIds: [id],
      columnId: target.id,
      beforeId: overIndex < 0 ? undefined : shown[overIndex + (isBelow ? 1 : 0)],
    });
  }

  function onDragEnd({ active, over, activatorEvent }: DragEndEvent) {
    const id = String(active.id);
    if (activatorEvent instanceof KeyboardEvent) focusAfterDrop.current = id;
    const column = findColumn(columns, id);
    if (over && column) {
      const shown = shownIds(column);
      const overIndex = shown.indexOf(String(over.id));
      const order = overIndex < 0 ? shown : arrayMove(shown, shown.indexOf(id), overIndex);
      const beforeId = order[order.indexOf(id) + 1];
      const before = findColumn(savedColumns, id);
      const shownBefore = before ? shownIds(before) : [];
      const isSamePlace =
        before?.id === column.id &&
        (column.id === UNASSIGNED || shownBefore[shownBefore.indexOf(id) + 1] === beforeId);
      if (!isSamePlace) onMove({ entryIds: [id], columnId: column.id, beforeId });
    }
    stopDragging();
  }

  function stopDragging() {
    setActiveId(null);
    setDragMove(null);
  }

  /** For screen readers, e.g. "Anna is in Reck, place 2 of 5". */
  function describe(key: 'over' | 'end', id: string, overId: string | undefined) {
    const name = nameOf(id);
    const column = overId === undefined ? undefined : columnAt(overId);
    if (!column) return t('lineups.dnd.cancel', { name });
    const shown = shownIds(column);
    const count = shown.includes(id) ? shown.length : shown.length + 1;
    const index = shown.indexOf(overId!);
    return t(`lineups.dnd.${key}`, {
      name,
      list: columnName(column.id),
      position: index < 0 ? count : index + 1,
      count,
    });
  }

  function nameOf(id: string) {
    const entry = byId.get(id);
    return entry ? entryName(entry) : '';
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t('lineups.dnd.start', { name: nameOf(String(active.id)) }),
    onDragOver: ({ active, over }) =>
      over ? describe('over', String(active.id), String(over.id)) : undefined,
    onDragEnd: ({ active, over }) =>
      describe('end', String(active.id), over ? String(over.id) : undefined),
    onDragCancel: ({ active }) => t('lineups.dnd.cancel', { name: nameOf(String(active.id)) }),
  };

  function renderColumn(column: Column) {
    const isUnassigned = column.id === UNASSIGNED;
    const shown = shownIds(column);
    const selectable = shown.filter((id) => !byId.get(id)!.withdrawn);
    const selectedHere = selectable.filter((id) => selected.includes(id));
    const total = column.entryIds.filter((id) => byId.get(id) && !byId.get(id)!.withdrawn).length;
    return (
      <LineupColumn
        key={column.id}
        id={column.id}
        shownIds={shown}
        name={columnName(column.id)}
        count={
          shown.length === column.entryIds.length ? `${total}` : `${selectable.length} / ${total}`
        }
        emptyText={
          column.entryIds.length > 0
            ? t('lineups.noMatch')
            : t(isUnassigned ? 'lineups.allAssigned' : 'lineups.emptyLineup')
        }
        checkbox={
          canEdit &&
          selectable.length > 0 && (
            <Checkbox
              checked={
                selectedHere.length === selectable.length ||
                (selectedHere.length > 0 && 'indeterminate')
              }
              onCheckedChange={(checked) => select(selectable, checked === true)}
              aria-label={t('lineups.selectAll', { list: columnName(column.id) })}
              className="relative after:absolute after:-inset-3.5"
            />
          )
        }
      >
        {shown.map((id) => {
          const up = stepMove(column.id, shown, id, 'up');
          const down = stepMove(column.id, shown, id, 'down');
          return (
            <LineupEntry
              key={id}
              entry={byId.get(id)!}
              position={activeId === null ? column.entryIds.indexOf(id) + 1 : undefined}
              ordered={!isUnassigned}
              canEdit={canEdit}
              selected={selected.includes(id)}
              onSelect={(isSelected) => select([id], isSelected)}
              onUp={up ? () => onMove(up) : undefined}
              onDown={down ? () => onMove(down) : undefined}
            />
          );
        })}
      </LineupColumn>
    );
  }

  const activeEntry = activeId === null ? undefined : byId.get(activeId);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('lineups.dnd.instructions') },
      }}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={stopDragging}
    >
      <div className="grid items-start gap-4 grid-cols-[minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-18">
          {columns.filter(({ id }) => id === UNASSIGNED).map(renderColumn)}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-start gap-4">
          {columns.filter(({ id }) => id !== UNASSIGNED).map(renderColumn)}
        </div>
      </div>

      <DragOverlay>
        {activeEntry && (
          <div className="flex min-h-11 items-center gap-2 rounded-md border border-primary bg-card px-3 text-sm font-medium shadow-lg">
            <GripVerticalIcon aria-hidden className="size-4" />
            <span className="truncate">{entryName(activeEntry)}</span>
          </div>
        )}
      </DragOverlay>

      {selected.length > 0 && (
        <div
          role="group"
          aria-label={t('lineups.selection')}
          className="sticky bottom-3 z-[5] mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary bg-card p-2 shadow-lg"
        >
          <span className="px-2 text-sm font-medium" aria-live="polite">
            {t('selected', { count: selected.length })}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('clearSelection')}
            onClick={() => setSelection(new Set())}
          >
            <XIcon aria-hidden />
          </Button>
          <span className="w-full px-2 text-sm text-muted-foreground sm:w-auto">
            {t('lineups.moveTo')}
          </span>
          {columns.map(({ id }) => (
            <Button key={id} size="sm" variant="outline" onClick={() => moveSelection(id)}>
              {columnName(id)}
            </Button>
          ))}
        </div>
      )}
    </DndContext>
  );
}

function LineupColumn({
  id,
  shownIds,
  name,
  count,
  emptyText,
  checkbox,
  children,
}: {
  id: string;
  shownIds: string[];
  name: string;
  count: string;
  emptyText: string;
  checkbox: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { isColumn: true } });
  const headingId = useId();

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-column={id}
      className={cn('rounded-xl border bg-card', isOver && 'border-primary')}
    >
      <header className="flex min-h-11 items-center gap-2 border-b px-4 py-1">
        {checkbox}
        <h2 id={headingId} className="min-w-0 flex-1 truncate font-semibold">
          {name}
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
      </header>
      <SortableContext id={id} items={shownIds} strategy={verticalListSortingStrategy}>
        <ol
          className={cn(
            'grid min-h-16 grid-cols-[minmax(0,1fr)] content-start gap-1 p-2',
            id === UNASSIGNED && 'max-h-[45dvh] overflow-y-auto xl:max-h-[calc(100dvh-9rem)]',
          )}
        >
          {children}
          {shownIds.length === 0 && (
            <li className="flex min-h-12 items-center justify-center text-sm text-muted-foreground">
              {emptyText}
            </li>
          )}
        </ol>
      </SortableContext>
    </section>
  );
}
