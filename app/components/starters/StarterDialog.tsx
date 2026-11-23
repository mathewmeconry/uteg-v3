import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Label } from '~/components/ui/label';
import type { ContestOptions } from '~/lib/contestOptions.server';
import type { Sex } from '~/modules/types';
import type { action } from '~/routes/secured/competition/starters';
import { AthleteInput } from './AthleteInput';
import { ClubCombobox, type ClubOption } from './ClubCombobox';
import { EntryFields } from './EntryFields';
import { NativeSelect } from './NativeSelect';
import { fullName, type StarterRow } from './starterRow';
import { useAthleteSuggestions, type AthleteSuggestion } from './useAthleteSuggestions';

type Person = {
  stvId: string;
  firstname: string;
  lastname: string;
  birthYear: string;
  sex: Sex | '';
};
type SuggestionField = 'stvId' | 'firstname' | 'lastname';

const NEW_PERSON: Person = { stvId: '', firstname: '', lastname: '', birthYear: '', sex: '' };

/** Adds a starter, or edits `starter`. Render it while it is open. */
export function StarterDialog({
  competitionId,
  starter,
  options,
  clubs,
  startingIds,
  onClose,
}: {
  competitionId: string;
  starter?: StarterRow;
  options: ContestOptions;
  clubs: ClubOption[];
  startingIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const fetcher = useFetcher<typeof action>();
  const [person, setPerson] = useState<Person>(
    starter
      ? { ...starter, stvId: starter.stvId ?? '', birthYear: `${starter.birthYear}` }
      : NEW_PERSON,
  );
  const [club, setClub] = useState<ClubOption | null>(starter?.club ?? null);
  const [linked, setLinked] = useState<AthleteSuggestion | null>(null);
  const [searchField, setSearchField] = useState<SuggestionField | null>(null);

  const query =
    searchField === 'stvId' ? person.stvId : `${person.firstname} ${person.lastname}`.trim();
  const suggestions = useAthleteSuggestions(competitionId, searchField ? query : '');
  const isListOpen = searchField !== null && suggestions.length > 0;

  const result = fetcher.data;
  const errors = result && 'errors' in result ? result.errors : undefined;
  const formError = result && 'error' in result ? result.error : undefined;
  const isDone = Boolean(result && 'ok' in result);

  useEffect(() => {
    if (isDone) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once
  }, [isDone]);

  function change(field: keyof Person, value: string) {
    setPerson((previous) => ({ ...previous, [field]: value }) as Person);
    // Someone else now. The server looks for the athlete again.
    setLinked(null);
  }

  function pick(athlete: AthleteSuggestion) {
    const { stvId, firstname, lastname, birthYear, sex } = athlete;
    setPerson({ stvId: stvId ?? '', firstname, lastname, birthYear: `${birthYear}`, sex });
    setClub((previous) => previous ?? athlete.club);
    setLinked(athlete);
    setSearchField(null);
  }

  const inputProps = (field: SuggestionField) => ({
    name: field,
    label: t(`common:fields.${field}`),
    value: person[field],
    error: errors?.[field],
    onChange: (event: { target: { value: string } }) => {
      change(field, event.target.value);
      if (!starter) setSearchField(field);
    },
    onBlur: () => setSearchField(null),
    // Nobody else can be picked for an existing starter.
    suggestions: starter ? null : searchField === field ? suggestions : [],
    startingIds,
    onPick: pick,
  });

  /** Marks a value that is another one in the master data. */
  function difference(field: 'firstname' | 'lastname' | 'birthYear' | 'sex') {
    if (!starter || String(starter.athlete[field]) === person[field].trim()) return undefined;
    const value = field === 'sex' ? t(`common:sex.${starter.athlete.sex}`) : starter.athlete[field];
    return <span className="font-medium text-foreground">{t('differsValue', { value })}</span>;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-2xl"
        onEscapeKeyDown={(event) => {
          if (!isListOpen) return;
          event.preventDefault();
          setSearchField(null);
        }}
        // A stray tap must not discard what was typed.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b p-4 pr-12 text-left sm:px-6">
          <DialogTitle>
            {starter ? t('editTitle', { name: fullName(starter) }) : t('createTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {starter ? t('editTitle', { name: fullName(starter) }) : t('createTitle')}
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="flex min-h-0 flex-1 flex-col" noValidate>
          <input type="hidden" name="intent" value={starter ? 'update' : 'create'} />
          <input type="hidden" name="contestId" value={options.id} />
          {starter && <input type="hidden" name="starterId" value={starter.id} />}
          {linked && <input type="hidden" name="athleteId" value={linked.athleteId} />}

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:px-6">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <AthleteInput
              {...inputProps('stvId')}
              hint={starter ? undefined : t('form.stvIdHint')}
              inputMode="numeric"
              maxLength={50}
            />
            <Columns>
              <AthleteInput
                {...inputProps('firstname')}
                hint={difference('firstname')}
                maxLength={100}
                required
              />
              <AthleteInput
                {...inputProps('lastname')}
                hint={difference('lastname')}
                maxLength={100}
                required
              />
            </Columns>
            <Columns>
              <FormField
                label={t('common:fields.birthYear')}
                name="birthYear"
                inputMode="numeric"
                maxLength={4}
                required
                value={person.birthYear}
                onChange={(event) => change('birthYear', event.target.value)}
                error={errors?.birthYear}
                hint={difference('birthYear') ?? (starter ? undefined : t('form.birthYearHint'))}
              />
              <FormField
                label={t('common:fields.sex')}
                error={errors?.sex}
                hint={difference('sex')}
              >
                {(props) => (
                  <NativeSelect
                    {...props}
                    name="sex"
                    required
                    value={person.sex}
                    onChange={(event) => change('sex', event.target.value)}
                  >
                    <option value="" disabled>
                      {t('choose')}
                    </option>
                    <option value="FEMALE">{t('common:sex.FEMALE')}</option>
                    <option value="MALE">{t('common:sex.MALE')}</option>
                  </NativeSelect>
                )}
              </FormField>
            </Columns>
            {linked && (
              <p
                role="status"
                className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground"
              >
                {t('form.linked', { name: `${fullName(linked)}, ${linked.birthYear}` })}
              </p>
            )}
            <FormField label={t('common:fields.club')} error={errors?.clubId}>
              {(props) => (
                <ClubCombobox
                  competitionId={competitionId}
                  clubs={clubs}
                  value={club}
                  onChange={setClub}
                  controlProps={props}
                />
              )}
            </FormField>
            <EntryFields
              options={options}
              sex={person.sex}
              defaultValue={{
                category: starter?.category ?? '',
                divisionId: starter?.divisionId ?? '',
                lineupId: starter?.lineupId ?? '',
              }}
            />
            {starter && (
              <Label className="flex items-start gap-3 rounded-md border p-3 leading-normal font-normal">
                <Checkbox
                  name="updateAthlete"
                  className="mt-1"
                  aria-describedby="update-athlete-hint"
                />
                <span>
                  <span className="font-medium">{t('form.updateAthlete')}</span>
                  <span id="update-athlete-hint" className="block text-muted-foreground">
                    {t('form.updateAthleteHint')}
                  </span>
                </span>
              </Label>
            )}
          </div>

          <DialogFooter className="flex-row justify-end border-t p-4 sm:px-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <SubmitButton pending={fetcher.state !== 'idle'}>
              {starter ? t('common:actions.save') : t('common:actions.add')}
            </SubmitButton>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function Columns({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-4 sm:grid-cols-2">{children}</div>;
}
