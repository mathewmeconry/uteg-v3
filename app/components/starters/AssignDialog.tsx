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
import { DivisionOptions, fittingDivisions, ApparatusOptions } from './EntryFields';
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
  const [choices, setChoices] = useState<
    Record<string, { divisionId: string; startApparatus: string }>
  >({});
  const { groups, withoutCategory } = groupForAssignment(starters);

  const assignments = groups.flatMap(({ key, entryIds }) => {
    const choice = choices[key];
    if (!choice?.divisionId) return [];
    const { divisionId, startApparatus } = choice;
    const start = startApparatus === KEEP ? undefined : startApparatus || null;
    return [{ entryIds, divisionId, startApparatus: start }];
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
        <DialogHeader className="border-b p-4 pr-14 text-left sm:pl-6">
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
              const choice = choices[key] ?? { divisionId: '', startApparatus: KEEP };
              // An apparatus belongs to a division, nobody can keep it in another one.
              const canKeep = (id: string) => members.some(({ divisionId }) => divisionId === id);
              const division = divisions.find(({ id }) => id === choice.divisionId);
              const movers = division
                ? members.filter(({ divisionId }) => divisionId !== division.id)
                : [];
              const losers = !division
                ? []
                : choice.startApparatus === KEEP
                  ? movers
                  : choice.startApparatus === ''
                    ? members
                    : [];
              const lostCount = losers.filter(({ startApparatus }) => startApparatus).length;
              return (
                <fieldset
                  key={key}
                  className="grid gap-3 border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0"
                >
                  <legend className="float-left mb-3 font-display text-lg">
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
                                  startApparatus:
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
                            value={choice.startApparatus}
                            disabled={!division}
                            onChange={(event) =>
                              setChoices({
                                ...choices,
                                [key]: { ...choice, startApparatus: event.target.value },
                              })
                            }
                          >
                            {(!division || canKeep(division.id)) && (
                              <option value={KEEP}>
                                {movers.length > 0 ? t('assign.keepIfPossible') : t('assign.keep')}
                              </option>
                            )}
                            <option value="">{t('noApparatus')}</option>
                            <ApparatusOptions division={division} />
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
