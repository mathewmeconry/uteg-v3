import { useTranslation } from 'react-i18next';
import type { GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Badge } from '~/components/ui/badge';
import { categoryName } from '~/lib/categoryName';
import { formatEntered } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import { fullName, type TabletSlot } from './types';

/** The starting order of a round. With `onSelect` a starter can be opened. */
export function StarterList({
  slots,
  drafts,
  currentId,
  showMissing = false,
  onSelect,
}: {
  slots: readonly TabletSlot[];
  drafts: GradeDrafts;
  currentId?: string;
  /** Marks starters without a grade. */
  showMissing?: boolean;
  onSelect?: (entryId: string) => void;
}) {
  const { t } = useTranslation(['judging', 'common']);
  if (slots.length === 0) {
    return <p className="px-2 py-1 text-muted-foreground">{t('list.empty')}</p>;
  }

  return (
    <ol className="flex flex-col gap-1">
      {slots.map((slot, index) => {
        const isCurrent = slot.entryId === currentId;
        const { saved, isDirty, isWaiting, evaluated } = drafts.get(slot);
        // Submitted and waiting for the connection.
        const grade = isWaiting ? evaluated.grade : saved;
        const content = (
          <>
            <span className="figure w-7 shrink-0 text-right text-muted-foreground">
              {index + 1}.
            </span>
            <span className={cn('min-w-0 flex-1', slot.withdrawn && 'line-through')}>
              <span className="block truncate font-semibold">{fullName(slot)}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {slot.clubName} · {categoryName(slot.category, t)} {t(`sexShort.${slot.sex}`)}
              </span>
            </span>
            {slot.withdrawn ? (
              <span className="text-sm text-muted-foreground">{t('withdrawn')}</span>
            ) : (
              <span className={cn('figure text-xl', isDirty && 'text-destructive')}>
                {grade && formatEntered(grade.value)}
                {showMissing && !grade && (
                  <Badge variant="destructive">{t('review.missing')}</Badge>
                )}
                {isDirty && <span aria-label={t('save.unsaved')}> •</span>}
              </span>
            )}
          </>
        );
        const className = cn(
          'flex min-h-14 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
          isCurrent && 'bg-ink text-ink-foreground [&_span]:text-ink-foreground',
        );
        return (
          <li key={slot.entryId} aria-current={isCurrent ? 'true' : undefined}>
            {onSelect && !slot.withdrawn ? (
              <button
                type="button"
                className={cn(className, !isCurrent && 'hover:bg-accent')}
                onClick={() => onSelect(slot.entryId)}
              >
                {content}
              </button>
            ) : (
              <div className={className}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
