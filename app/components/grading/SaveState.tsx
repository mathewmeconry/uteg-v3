import { CheckIcon, LoaderCircleIcon, PencilIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { formatEntered } from '~/lib/domain/gradeInput';
import { cn } from '~/lib/utils';
import type { Draft, GradeDrafts } from './useGradeDrafts';

type EntryState = ReturnType<GradeDrafts['get']>;

/** One line: saved, being saved, not saved. */
export function SaveState({ state, className }: { state: EntryState; className?: string }) {
  const { t } = useTranslation('judging');
  const { saved } = state;

  let content: [typeof CheckIcon, string, string] | null = null;
  if (state.isSaving) content = [LoaderCircleIcon, t('save.saving'), 'text-muted-foreground'];
  else if (state.isConflict) {
    content = [TriangleAlertIcon, t('save.conflictTitle'), 'text-destructive'];
  } else if (state.rejected) {
    content = [TriangleAlertIcon, t('save.rejectedTitle'), 'text-destructive'];
  } else if (state.isWaiting) {
    content = [TriangleAlertIcon, t('save.waiting'), 'text-destructive'];
  } else if (state.isDirty) {
    content = [PencilIcon, t('save.unsaved'), 'text-warning-foreground dark:text-warning'];
  } else if (saved) {
    content = [CheckIcon, t('save.saved', { grade: formatEntered(saved.value) }), 'text-success'];
  }
  const [Icon, text, color] = content ?? [null, '', ''];

  return (
    <p
      role="status"
      className={cn('flex min-h-6 items-center gap-1.5 font-medium', color, className)}
    >
      {Icon && (
        <Icon aria-hidden className={cn('size-4 shrink-0', state.isSaving && 'animate-spin')} />
      )}
      {text}
    </p>
  );
}

/** Asks which grade counts when someone else saved one meanwhile. */
export function ConflictNotice({
  state,
  onUseSaved,
  onUseOwn,
}: {
  state: EntryState;
  onUseSaved: () => void;
  onUseOwn: () => void;
}) {
  const { t } = useTranslation('judging');
  const { grade } = state.evaluated;
  const own = grade ? formatEntered(grade.value) : t('save.unfinished');

  return (
    <Warning title={t('save.conflictTitle')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 basis-48">
          {state.saved
            ? t('save.conflictText', { saved: formatEntered(state.saved.value), own })
            : t('save.conflictDeleted', { own })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onUseSaved}>
            {t('save.useSaved')}
          </Button>
          <Button type="button" disabled={!grade} onClick={onUseOwn}>
            {t('save.useOwn')}
          </Button>
        </div>
      </div>
    </Warning>
  );
}

export function RejectedNotice({ code }: { code: NonNullable<Draft['rejected']> }) {
  const { t } = useTranslation(['judging', 'common']);
  return (
    <Warning title={t('save.rejectedTitle')}>
      <p>
        {code === 'ENTRY_NOT_JUDGEABLE' ? t('save.stoppedText') : t(`common:domainErrors.${code}`)}
      </p>
    </Warning>
  );
}

export function Warning({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="grid grid-cols-1 gap-2 rounded-lg border-2 border-destructive bg-card px-4 py-3 wrap-anywhere [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal"
    >
      <p className="flex items-center gap-2 text-lg font-bold text-destructive">
        <TriangleAlertIcon aria-hidden className="size-5 shrink-0" />
        {title}
      </p>
      {children}
    </div>
  );
}
