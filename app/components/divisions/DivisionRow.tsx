import {
  ClipboardPenIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
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
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
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
}: {
  division: Division;
  canEdit: boolean;
  selected: boolean;
  sheetsHref: string;
  onSelect: (selected: boolean) => void;
  onAction: (action: RowAction) => void;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const name = useDivisionName()(division);
  const { state, round, rounds, starterCount, unassignedCount } = division;
  const startLabel = state === 'ENDED' ? t('start.restart') : t('common:actions.start');

  return (
    <li
      data-state={selected ? 'selected' : undefined}
      className="flex items-start gap-1 px-2 py-3 data-[state=selected]:bg-accent/60 lg:items-center"
    >
      <span className="flex size-11 shrink-0 items-center justify-center lg:size-9">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={t('select', { name })}
          // The touch target is larger than the box.
          className="relative after:absolute after:-inset-3.5"
        />
      </span>
      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-2 lg:grid-cols-[minmax(0,1.2fr)_9rem_minmax(0,1.2fr)_14.5rem] lg:items-center">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 pt-2.5 lg:pt-0">
          <h2 className="font-semibold">
            {division.category} {t(`common:sex.${division.sex}`)}
          </h2>
          <span className="text-muted-foreground">{t('number', { number: division.number })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <DivisionStateBadge state={state} />
          {state === 'RUNNING' && (
            <span className="text-sm tabular-nums">
              {t('roundOf', { round: round + 1, rounds })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPinIcon aria-hidden className="size-4 shrink-0" />
            {t('common:ground', { number: division.ground })}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <UsersIcon aria-hidden className="size-4 shrink-0" />
            {t('common:starterCount', { count: starterCount })}
          </span>
          {unassignedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground tabular-nums">
              <TriangleAlertIcon
                aria-hidden
                className="size-4 shrink-0 text-warning-foreground dark:text-warning"
              />
              {t('unassigned', { count: unassignedCount })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canEdit &&
            (state === 'RUNNING' ? (
              <Button
                size="sm"
                variant="outline"
                aria-label={`${t('common:actions.stop')}: ${name}`}
                onClick={() => onAction('stop')}
              >
                <SquareIcon aria-hidden />
                {t('common:actions.stop')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant={state === 'ENDED' ? 'outline' : 'default'}
                aria-label={`${startLabel}: ${name}`}
                onClick={() => onAction('start')}
              >
                {state === 'ENDED' ? <RotateCcwIcon aria-hidden /> : <PlayIcon aria-hidden />}
                {startLabel}
              </Button>
            ))}
          <Button asChild size="sm" variant="outline">
            <Link to={`${division.id}/lineups`} aria-label={`${t('lineups.short')}: ${name}`}>
              <UsersIcon aria-hidden />
              {t('lineups.short')}
            </Link>
          </Button>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={t('actionsFor', { name })}>
            <EllipsisVerticalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`${division.id}/grading`}>
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
              <DropdownMenuItem onSelect={() => onAction('ground')}>
                <MapPinIcon aria-hidden />
                {t('ground.title')}
              </DropdownMenuItem>
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
