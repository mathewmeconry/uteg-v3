import { ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SubmitButton } from '~/components/SubmitButton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import type { ClubAnswer } from '~/lib/starters.server';
import type { ClubOption } from './ClubCombobox';
import { FormAlert } from './FormAlert';
import { fullName } from './starterRow';

export type ClubConflict = {
  starterId: string;
  firstname: string;
  lastname: string;
  birthYear: number;
  club: ClubOption;
};

/** Asks whose club an import may change. Nobody's by default. Render it while it is open. */
export function ClubConflictDialog({
  conflicts,
  club,
  error,
  isPending,
  onImport,
  onBack,
  focusAfterwards,
}: {
  conflicts: ClubConflict[];
  club: ClubOption;
  error?: string;
  isPending: boolean;
  onImport: (answers: ClubAnswer[]) => void;
  onBack: () => void;
  focusAfterwards: () => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !isPending && onBack()}>
      <AlertDialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusAfterwards();
        }}
      >
        <AlertDialogHeader className="border-b p-4 text-left sm:px-6">
          <AlertDialogTitle>
            {t('import.conflicts.title', { count: conflicts.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t('import.conflicts.text')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:px-6">
          {error && <FormAlert message={error} />}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(conflicts.map(({ starterId }) => starterId)))}
            >
              {t('common:actions.selectAll')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              {t('import.conflicts.selectNone')}
            </Button>
          </div>
          <ul className="grid divide-y rounded-md border">
            {conflicts.map((conflict) => (
              <li key={conflict.starterId}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 p-3 text-sm">
                  <input
                    type="checkbox"
                    aria-labelledby={`conflict-${conflict.starterId}`}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={selected.has(conflict.starterId)}
                    onChange={() => toggle(conflict.starterId)}
                  />
                  <span id={`conflict-${conflict.starterId}`} className="min-w-0">
                    <span className="font-medium">
                      {fullName(conflict)}, {conflict.birthYear}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
                      {conflict.club.name}, {conflict.club.location}
                      <ArrowRightIcon aria-hidden className="size-3.5" />
                      <span className="sr-only">{t('import.conflicts.becomes')}</span>
                      {club.name}, {club.location}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4 sm:px-6">
          <p role="status" className="basis-full text-sm sm:mr-auto sm:basis-auto">
            {t('import.conflicts.willChange', { count: selected.size })}
          </p>
          <AlertDialogCancel type="button" className="pointer-coarse:min-h-11" disabled={isPending}>
            {t('common:actions.back')}
          </AlertDialogCancel>
          <SubmitButton
            type="button"
            pending={isPending}
            onClick={() =>
              onImport(
                conflicts.map(({ starterId, club: { id: fromClubId } }) => ({
                  starterId,
                  fromClubId,
                  change: selected.has(starterId),
                })),
              )
            }
          >
            {t('common:actions.import')}
          </SubmitButton>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
