import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardPenIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  GripVerticalIcon,
  MapPinIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  TrashIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DivisionStateBadge } from '~/components/DivisionStateBadge';
import { StatusBadge } from '~/components/StatusBadge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';
import type { Division } from './divisionList';
import { useDivisionName } from './useDivisionName';

export type RowAction = 'start' | 'stop' | 'ground' | 'delete';

export function DivisionRow({
  division,
  canEdit,
  selected,
  sheetsHref,
  onSelect,
  onAction,
  onUp,
  onDown,
}: {
  division: Division;
  canEdit: boolean;
  selected: boolean;
  sheetsHref: string;
  onSelect: (selected: boolean) => void;
  onAction: (action: RowAction) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const name = useDivisionName()(division);
  const { id, state, round, rounds, starterCount, unassignedCount } = division;
  const canMove = canEdit && state === 'PENDING';
  const { listeners, setNodeRef: setHandle, isDragging } = useDraggable({ id, disabled: !canMove });
  const { setNodeRef: setRow, isOver } = useDroppable({ id, disabled: !canEdit });

  return (
    <li
      ref={setRow}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'flex items-center gap-1 px-2 py-2 data-[state=selected]:bg-accent',
        isDragging && 'opacity-40',
        // It is dropped above this one, or after what is not planned any more.
        isOver &&
          !isDragging &&
          (state === 'PENDING'
            ? 'shadow-[inset_0_3px_0_var(--primary)]'
            : 'shadow-[inset_0_-3px_0_var(--primary)]'),
      )}
    >
      {canMove ? (
        <Button
          ref={setHandle}
          variant="ghost"
          size="icon-sm"
          aria-label={t('order.drag', { name })}
          {...listeners}
          // The keyboard uses the menu.
          tabIndex={-1}
          className="w-7 cursor-grab touch-none px-0 text-muted-foreground pointer-coarse:w-11"
        >
          <GripVerticalIcon aria-hidden />
        </Button>
      ) : (
        canEdit && <span className="w-7 shrink-0 pointer-coarse:w-11" />
      )}
      <span className="flex size-11 shrink-0 items-center justify-center pointer-fine:lg:size-9">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={t('select', { name })}
          // The touch target is larger than the box.
          className="relative after:absolute after:-inset-3.5"
        />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3>
            <Link
              to={`${id}/lineups`}
              className="inline-flex flex-wrap items-baseline gap-x-2 underline-offset-4 hover:underline pointer-coarse:min-h-11 pointer-coarse:items-center"
            >
              <span className="font-semibold">
                {division.category} {t(`common:sex.${division.sex}`)}
              </span>
              <span className="text-muted-foreground">
                {t('number', { number: division.number })}
              </span>
            </Link>
          </h3>
          <DivisionStateBadge state={state} />
          {state === 'RUNNING' && (
            <span className="text-sm tabular-nums">
              {t('roundOf', { round: round + 1, rounds })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{t('common:starterCount', { count: starterCount })}</span>
          {unassignedCount > 0 && (
            <StatusBadge tone="warning" icon={TriangleAlertIcon}>
              {t('unassigned', { count: unassignedCount })}
            </StatusBadge>
          )}
        </div>
      </div>
      {canEdit && state === 'PENDING' && (
        <Button
          size="sm"
          variant="outline"
          aria-label={`${t('common:actions.start')}: ${name}`}
          onClick={() => onAction('start')}
        >
          <PlayIcon aria-hidden />
          <span className="max-sm:sr-only">{t('common:actions.start')}</span>
        </Button>
      )}
      {canEdit && state === 'RUNNING' && (
        <Button
          size="sm"
          variant="outline"
          aria-label={`${t('common:actions.stop')}: ${name}`}
          onClick={() => onAction('stop')}
        >
          <SquareIcon aria-hidden />
          <span className="max-sm:sr-only">{t('common:actions.stop')}</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={t('actionsFor', { name })}>
            <EllipsisVerticalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`${id}/lineups`}>
              <UsersIcon aria-hidden />
              {t('lineups.short')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`${id}/grading`}>
              <ClipboardPenIcon aria-hidden />
              {t('common:nav.grading')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={sheetsHref} target="_blank" rel="noreferrer">
              <FileTextIcon aria-hidden />
              {t('sheets.print')}
            </a>
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              {canMove && (
                <>
                  <DropdownMenuItem disabled={!onUp} onSelect={onUp}>
                    <ArrowUpIcon aria-hidden />
                    {t('order.up')}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!onDown} onSelect={onDown}>
                    <ArrowDownIcon aria-hidden />
                    {t('order.down')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onSelect={() => onAction('ground')}>
                <MapPinIcon aria-hidden />
                {t('ground.title')}
              </DropdownMenuItem>
              {state === 'ENDED' && (
                <DropdownMenuItem onSelect={() => onAction('start')}>
                  <RotateCcwIcon aria-hidden />
                  {t('start.restart')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={state === 'RUNNING'}
                onSelect={() => onAction('delete')}
              >
                <TrashIcon aria-hidden />
                {t('common:actions.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
