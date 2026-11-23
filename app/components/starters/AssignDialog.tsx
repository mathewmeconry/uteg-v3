import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import type { ContestOptions } from '~/lib/contestOptions.server';
import type { clientAction } from '~/routes/secured/competition/starters';
import { groupForAssignment } from './assignGroups';
import { DivisionOptions, fittingDivisions, LineupOptions } from './EntryFields';
import { FormAlert } from './FormAlert';
import { useActionError } from './keepPage';
import { NativeSelect } from './NativeSelect';
import type { StarterRow } from './starterRow';
import { useReturnFocus } from './useReturnFocus';

const KEEP = 'keep';

/** Assigns starters to divisions, per category and sex. Render it while it is open. */
export function AssignDialog({
  starters,
  options,
  onClose,
}: {
  starters: StarterRow[];
  options: ContestOptions;
  onClose: () => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const fetcher = useFetcher<typeof clientAction>();
  const returnFocus = useReturnFocus();
  const [choices, setChoices] = useState<Record<string, { divisionId: string; lineupId: string }>>(
    {},
  );
  const { groups, withoutCategory } = groupForAssignment(starters);

  const assignments = groups.flatMap(({ key, entryIds }) => {
    const choice = choices[key];
    if (!choice?.divisionId) return [];
    const { divisionId, lineupId } = choice;
    return [{ entryIds, divisionId, lineupId: lineupId === KEEP ? undefined : lineupId || null }];
  });
  const error = useActionError(fetcher.data);
  const isDone = Boolean(fetcher.data && 'ok' in fetcher.data);

  useEffect(() => {
    if (isDone) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once
  }, [isDone]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl"
        onCloseAutoFocus={returnFocus}
      >
        <DialogHeader className="border-b p-4 pr-12 text-left sm:px-6">
          <DialogTitle>{t('assign.title')}</DialogTitle>
          <DialogDescription>
            {t('assign.description', { count: starters.length })}
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="intent" value="assign" />
          <input type="hidden" name="assignments" value={JSON.stringify(assignments)} />
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:px-6">
            {error && fetcher.state === 'idle' && <FormAlert message={error} />}
            {groups.map(({ key, category, sex, entryIds, members }) => {
              const divisions = fittingDivisions(options, { category, sex });
              const choice = choices[key] ?? { divisionId: '', lineupId: KEEP };
              // An apparatus belongs to a division, nobody can keep it in another one.
              const canKeep = (id: string) => members.some(({ divisionId }) => divisionId === id);
              const division = divisions.find(({ id }) => id === choice.divisionId);
              const movers = division
                ? members.filter(({ divisionId }) => divisionId !== division.id)
                : [];
              const losers = !division
                ? []
                : choice.lineupId === KEEP
                  ? movers
                  : choice.lineupId === ''
                    ? members
                    : [];
              const lostCount = losers.filter(({ lineupId }) => lineupId).length;
              return (
                <fieldset key={key} className="grid gap-3 rounded-md border p-4">
                  <legend className="px-1 font-semibold">
                    {category} · {t(`common:sex.${sex}`)} ({entryIds.length})
                  </legend>
                  {divisions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('assign.noDivisions')}</p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label={t('division')}>
                        {(props) => (
                          <NativeSelect
                            {...props}
                            value={choice.divisionId}
                            onChange={(event) =>
                              setChoices({
                                ...choices,
                                [key]: {
                                  divisionId: event.target.value,
                                  lineupId:
                                    !event.target.value || canKeep(event.target.value) ? KEEP : '',
                                },
                              })
                            }
                          >
                            <option value="">{t('assign.keep')}</option>
                            <DivisionOptions divisions={divisions} />
                          </NativeSelect>
                        )}
                      </FormField>
                      <FormField
                        label={t('common:fields.startApparatus')}
                        hint={lostCount > 0 && t('assign.cleared', { count: lostCount })}
                      >
                        {(props) => (
                          <NativeSelect
                            {...props}
                            value={choice.lineupId}
                            disabled={!division}
                            onChange={(event) =>
                              setChoices({
                                ...choices,
                                [key]: { ...choice, lineupId: event.target.value },
                              })
                            }
                          >
                            {(!division || canKeep(division.id)) && (
                              <option value={KEEP}>
                                {movers.length > 0 ? t('assign.keepIfPossible') : t('assign.keep')}
                              </option>
                            )}
                            <option value="">{t('noApparatus')}</option>
                            <LineupOptions division={division} />
                          </NativeSelect>
                        )}
                      </FormField>
                    </div>
                  )}
                </fieldset>
              );
            })}
            {withoutCategory > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('assign.withoutCategory', { count: withoutCategory })}
              </p>
            )}
          </div>
          <DialogFooter className="flex-row justify-end border-t p-4 sm:px-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <SubmitButton pending={fetcher.state !== 'idle'} disabled={assignments.length === 0}>
              {t('assign.action')}
            </SubmitButton>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
