import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { cn } from '~/lib/utils';

export type LineupEntryData = {
  id: string;
  starterId: string;
  firstname: string;
  lastname: string;
  clubId: string;
  clubName: string;
  withdrawn: boolean;
};

export function entryName({
  firstname,
  lastname,
}: Pick<LineupEntryData, 'firstname' | 'lastname'>) {
  return `${lastname} ${firstname}`;
}

export function LineupEntry({
  entry,
  position,
  editUrl,
  canEdit,
  selected,
  onSelect,
  onUp,
  onDown,
  ordered,
}: {
  entry: LineupEntryData;
  /** 1-based, also counting entries the filter hides. Not known while something is dragged. */
  position?: number;
  editUrl: string;
  canEdit: boolean;
  selected: boolean;
  /** Unassigned starters have no order. */
  ordered: boolean;
  onSelect: (selected: boolean) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { t } = useTranslation('divisions');
  const name = entryName(entry);
  // Someone withdrawn keeps the slot, but others can be moved around it.
  const canMove = canEdit && !entry.withdrawn;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: { draggable: !canMove, droppable: !canEdit } });

  const text = (
    <>
      <span
        className={cn(
          'block truncate leading-snug font-semibold',
          entry.withdrawn && 'line-through',
        )}
      >
        {name}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {entry.withdrawn ? t('lineups.withdrawn') : entry.clubName}
      </span>
    </>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-entry={entry.id}
      className={cn(
        'group/entry relative mx-1 flex min-h-11 items-center gap-0.5 rounded-md bg-card py-0.5 hover:bg-muted max-[359px]:pointer-coarse:flex-wrap',
        selected && 'bg-accent hover:bg-accent',
        isDragging && 'opacity-40',
      )}
    >
      {canMove && (
        <>
          <Button
            ref={setActivatorNodeRef}
            variant="ghost"
            size="icon-sm"
            className="w-7 cursor-grab touch-none px-0 text-muted-foreground"
            {...attributes}
            {...listeners}
            aria-label={t('lineups.drag', { name })}
          >
            <GripVerticalIcon aria-hidden />
          </Button>
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(checked === true)}
            aria-label={t('lineups.select', { name })}
            className="relative mx-1.5 after:absolute after:-inset-x-2 after:-inset-y-3.5"
          />
        </>
      )}
      {ordered && (
        <span className="figure w-6 shrink-0 text-right text-sm text-muted-foreground">
          {position && `${position}.`}
        </span>
      )}
      <span className={cn('min-w-0 flex-1 px-1 text-sm', !canMove && !ordered && 'pl-2')}>
        {canMove ? (
          <Link
            to={editUrl}
            state={{ returnBack: true }}
            aria-label={t('lineups.edit', { name })}
            className="flex flex-col justify-center rounded-sm hover:underline pointer-coarse:min-h-11"
          >
            {text}
          </Link>
        ) : (
          text
        )}
      </span>
      {canMove && ordered && (
        // With a mouse only while pointing at the entry, the lists are narrow.
        <span className="flex shrink-0 rounded-md bg-inherit text-muted-foreground *:w-7 max-[359px]:pointer-coarse:w-full max-[359px]:pointer-coarse:justify-end pointer-fine:absolute pointer-fine:inset-y-0 pointer-fine:right-0 pointer-fine:items-center pointer-fine:opacity-0 group-hover/entry:opacity-100 group-focus-within/entry:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            // Not disabled, that would drop the focus when the end of the list is reached.
            aria-disabled={!onUp}
            className="aria-disabled:opacity-40"
            onClick={onUp}
            aria-label={t('lineups.up', { name })}
          >
            <ArrowUpIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-disabled={!onDown}
            className="aria-disabled:opacity-40"
            onClick={onDown}
            aria-label={t('lineups.down', { name })}
          >
            <ArrowDownIcon aria-hidden />
          </Button>
        </span>
      )}
    </li>
  );
}
