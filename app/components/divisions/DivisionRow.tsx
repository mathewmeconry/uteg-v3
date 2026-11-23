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
      className="flex items-start gap-1 px-2 py-2.5 data-[state=selected]:bg-accent lg:items-center"
    >
      <span className="flex size-11 shrink-0 items-center justify-center pointer-fine:lg:size-9">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={t('select', { name })}
          // The touch target is larger than the box.
          className="relative after:absolute after:-inset-3.5"
        />
      </span>
      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center xl:grid-cols-[minmax(0,1fr)_13.5rem_minmax(0,1.6fr)_14.5rem]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 pt-2 md:order-1 md:pt-0">
          <h2 className="font-semibold">
            {division.category} {t(`common:sex.${division.sex}`)}
          </h2>
          <span className="text-muted-foreground">{t('number', { number: division.number })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:order-3 xl:order-2">
          <DivisionStateBadge state={state} />
          {state === 'RUNNING' && (
            <span className="text-sm tabular-nums">
              {t('roundOf', { round: round + 1, rounds })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground max-sm:-mr-11 md:order-4 md:col-span-2 xl:order-3 xl:col-span-1">
          <span className="inline-flex items-center gap-1.5">
            <MapPinIcon aria-hidden className="size-4 shrink-0 max-sm:hidden" />
            {t('common:ground', { number: division.ground })}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <UsersIcon aria-hidden className="size-4 shrink-0 max-sm:hidden" />
            {t('common:starterCount', { count: starterCount })}
          </span>
          {unassignedCount > 0 && (
            <StatusBadge tone="warning" icon={TriangleAlertIcon}>
              {t('unassigned', { count: unassignedCount })}
            </StatusBadge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 md:order-2 md:row-span-2 md:justify-end xl:order-4 xl:row-span-1">
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
                // Restarting is rarely wanted.
                variant={state === 'ENDED' ? 'ghost' : 'outline'}
                className={
                  state === 'ENDED'
                    ? 'text-muted-foreground'
                    : 'border-primary text-primary hover:border-primary hover:bg-primary hover:text-primary-foreground'
                }
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
