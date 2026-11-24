import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { inRunningOrder, type Division, type DivisionMove } from './divisionList';
import { useDivisionName } from './useDivisionName';

/** Prefers the division below the pointer over its ground. */
const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const rows = hits.filter(
    ({ id }) =>
      args.droppableContainers.find((item) => item.id === id)?.data.current?.ground === undefined,
  );
  return rows.length > 0 ? rows : hits;
};

/** The divisions of each ground in running order. Planned ones are moved with the pointer. */
export function DivisionBoard({
  divisions,
  grounds,
  onMove,
  children,
}: {
  divisions: Division[];
  grounds: number[];
  onMove: (move: DivisionMove) => void;
  children: (division: Division, planned: Division[]) => ReactNode;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const divisionName = useDivisionName();
  const dndId = useId();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dragged = divisions.find(({ id }) => id === draggedId);

  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggedId(null);
    const id = String(active.id);
    if (!over || over.id === id) return;
    const ground = over.data.current?.ground as number | undefined;
    if (ground !== undefined) return onMove({ id, ground });
    const before = divisions.find((division) => division.id === over.id);
    if (before) onMove({ id, ground: before.ground, beforeId: before.id });
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={({ active }) => setDraggedId(String(active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggedId(null)}
    >
      <div
        className={cn('grid items-start gap-x-6 gap-y-7', grounds.length > 1 && 'xl:grid-cols-2')}
      >
        {grounds.map((ground) => {
          const items = inRunningOrder(divisions.filter((division) => division.ground === ground));
          const planned = items.filter(({ state }) => state === 'PENDING');
          return (
            <Ground key={ground} ground={ground}>
              {items.length === 0 ? (
                <p className="px-4 py-6 text-muted-foreground">{t('order.emptyGround')}</p>
              ) : (
                <ul className="divide-y">{items.map((division) => children(division, planned))}</ul>
              )}
            </Ground>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="w-max rounded-lg border bg-popover px-4 py-2.5 font-semibold shadow-lg">
            {divisionName(dragged)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Ground({ ground, children }: { ground: number; children: ReactNode }) {
  const { t } = useTranslation();
  const titleId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: `ground-${ground}`, data: { ground } });

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="mb-2 font-display text-lg">
        {t('ground', { number: ground })}
      </h2>
      <div
        ref={setNodeRef}
        // Below the last one there is room to drop at the end.
        className={cn(
          'overflow-hidden rounded-xl border bg-card pb-2',
          isOver && 'border-primary ring-2 ring-primary/30',
        )}
      >
        {children}
      </div>
    </section>
  );
}
