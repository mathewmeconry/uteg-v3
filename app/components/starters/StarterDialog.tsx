import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
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
import { useSexes } from '~/hooks/useSexes';
import type { ContestOptions } from '~/lib/contestOptions.server';
import type { Sex } from '~/modules/types';
import type { clientAction } from '~/routes/secured/competition/starters';
import { AthleteInput } from './AthleteInput';
import { ClubCombobox, type ClubOption } from './ClubCombobox';
import { EntryFields } from './EntryFields';
import { FormAlert } from './FormAlert';
import { useActionError } from './keepPage';
import { NativeSelect } from './NativeSelect';
import { fullName, type StarterRow } from './starterRow';
import { useReturnFocus } from './useReturnFocus';
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
  personOnly = false,
  onClose,
}: {
  competitionId: string;
  starter?: StarterRow;
  options: ContestOptions;
  clubs: ClubOption[];
  startingIds: ReadonlySet<string>;
  /** Leaves out the assignment, the sex it depends on, and the master data. */
  personOnly?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const fetcher = useFetcher<typeof clientAction>();
  const returnFocus = useReturnFocus();
  const sexes = useSexes();
  const [person, setPerson] = useState<Person>(
    starter
      ? { ...starter, stvId: starter.stvId ?? '', birthYear: `${starter.birthYear}` }
      : { ...NEW_PERSON, sex: sexes.length > 1 ? '' : sexes[0] },
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
  const formError = useActionError(result);
  const isDone = Boolean(result && 'ok' in result);
  const formRef = useRef<HTMLFormElement>(null);
  const isSent = useRef(false);
  const addsAnother = useRef(false);

  useEffect(() => {
    if (errors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  useEffect(() => {
    if (!isDone || fetcher.state !== 'idle' || !isSent.current) return;
    isSent.current = false;
    if (!addsAnother.current) return onClose();
    // Most come from a list of one club and category.
    setPerson(({ sex }) => ({ ...NEW_PERSON, sex }));
    setLinked(null);
    formRef.current?.querySelector<HTMLElement>('[name="firstname"]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer
  }, [result, fetcher.state]);

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
        onCloseAutoFocus={returnFocus}
        // A stray tap must not discard what was typed.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b p-4 pr-14 text-left sm:pl-6">
          <DialogTitle>
            {starter ? t('editTitle', { name: fullName(starter) }) : t('createTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {starter ? t('editTitle', { name: fullName(starter) }) : t('createTitle')}
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form
          ref={formRef}
          method="post"
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={() => (isSent.current = true)}
        >
          <input type="hidden" name="intent" value={starter ? 'update' : 'create'} />
          <input type="hidden" name="contestId" value={options.id} />
          {starter && <input type="hidden" name="starterId" value={starter.id} />}
          {linked && <input type="hidden" name="athleteId" value={linked.athleteId} />}

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:px-6">
            {formError && fetcher.state === 'idle' && <FormAlert message={formError} />}
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
              {/* The sex of a suggested person may be one that does not take part. */}
              {personOnly || (sexes.length === 1 && person.sex === sexes[0]) ? (
                <input type="hidden" name="sex" value={person.sex} />
              ) : (
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
              )}
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
                  canCreate={!personOnly}
                />
              )}
            </FormField>
            {!personOnly && (
              <EntryFields
                options={options}
                sex={person.sex}
                defaultValue={{
                  category: starter?.category ?? '',
                  divisionId: starter?.divisionId ?? '',
                  startApparatus: starter?.startApparatus ?? '',
                }}
              />
            )}
            {starter && !personOnly && (
              <Label className="flex items-start gap-3 rounded-lg bg-muted p-3 leading-normal font-normal">
                <Checkbox
                  name="updateAthlete"
                  className="mt-1"
                  aria-describedby="update-athlete-hint"
                />
                <span>
                  <span className="font-semibold">{t('form.updateAthlete')}</span>
                  <span id="update-athlete-hint" className="block text-muted-foreground">
                    {t('form.updateAthleteHint')}
                  </span>
                </span>
              </Label>
            )}
          </div>

          <DialogFooter className="flex-row flex-wrap justify-end border-t p-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              // Three buttons are too many for phones, there is a cross as well.
              className={starter ? undefined : 'max-sm:hidden'}
              onClick={onClose}
            >
              {t('common:actions.cancel')}
            </Button>
            {/* Before the other one, the first is what Enter presses. */}
            <SubmitButton
              pending={fetcher.state !== 'idle'}
              className="order-last max-sm:px-3"
              onClick={() => (addsAnother.current = false)}
            >
              {starter ? t('common:actions.save') : t('common:actions.add')}
            </SubmitButton>
            {!starter && (
              <SubmitButton
                pending={fetcher.state !== 'idle'}
                variant="outline"
                className="max-sm:px-2.5"
                onClick={() => (addsAnother.current = true)}
              >
                {t('addAnother')}
              </SubmitButton>
            )}
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function Columns({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-4 sm:grid-cols-2">{children}</div>;
}
