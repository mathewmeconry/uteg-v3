import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { FormField, type FieldControlProps } from '~/components/FormField';
import { Button } from '~/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import type { action } from '~/routes/api/competition/clubs';

export type ClubOption = { id: string; name: string; location: string };

/** Picks a club or creates a new one. Submits its id as `clubId`. */
export function ClubCombobox({
  competitionId,
  clubs,
  value,
  onChange,
  controlProps,
}: {
  competitionId: string;
  clubs: ClubOption[];
  value: ClubOption | null;
  onChange: (club: ClubOption) => void;
  controlProps: FieldControlProps;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    setSearch('');
    setCreating(false);
  }

  function choose(club: ClubOption) {
    onChange(club);
    handleOpenChange(false);
  }

  return (
    <>
      <input type="hidden" name="clubId" value={value?.id ?? ''} />
      {/* Modal, otherwise a dialog around it blocks scrolling in the list. */}
      <Popover open={open} onOpenChange={handleOpenChange} modal>
        <PopoverTrigger asChild>
          <Button
            {...controlProps}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal pointer-coarse:min-h-11"
          >
            <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>
              {value ? `${value.name}, ${value.location}` : t('choose')}
            </span>
            <ChevronsUpDownIcon aria-hidden className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-64 p-0"
          aria-label={t('common:fields.club')}
        >
          {creating ? (
            <NewClub competitionId={competitionId} defaultName={search} onCreated={choose} />
          ) : (
            <Command>
              <CommandInput
                placeholder={t('club.search')}
                value={search}
                onValueChange={setSearch}
              />
              <CommandList className="max-h-60">
                <CommandEmpty>{t('club.empty')}</CommandEmpty>
                <CommandGroup>
                  {clubs.map((club) => (
                    <CommandItem
                      key={club.id}
                      value={club.id}
                      keywords={[club.name, club.location]}
                      onSelect={() => choose(club)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {club.name}
                        <span className="text-muted-foreground">, {club.location}</span>
                      </span>
                      {club.id === value?.id && <CheckIcon aria-hidden />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => setCreating(true)}
                >
                  <PlusIcon aria-hidden />
                  <span className="truncate">
                    {search.trim() ? t('club.newNamed', { name: search.trim() }) : t('club.new')}
                  </span>
                </Button>
              </div>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

function NewClub({
  competitionId,
  defaultName,
  onCreated,
}: {
  competitionId: string;
  defaultName: string;
  onCreated: (club: ClubOption) => void;
}) {
  const { t } = useTranslation(['starters', 'common']);
  const fetcher = useFetcher<typeof action>();
  const [name, setName] = useState(defaultName.trim());
  const [location, setLocation] = useState('');
  const created = fetcher.data?.club;

  useEffect(() => {
    if (created) onCreated(created);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once per created club
  }, [created]);

  // Not a form: this is rendered inside the form the club is picked for.
  function submit() {
    if (fetcher.state !== 'idle') return;
    void fetcher.submit(
      { name, location },
      { method: 'post', action: `/api/competitions/${competitionId}/clubs` },
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  }

  return (
    <div className="grid gap-4 p-4">
      <FormField
        label={t('club.name')}
        value={name}
        maxLength={200}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        error={fetcher.data?.errors?.name}
      />
      <FormField
        label={t('common:fields.location')}
        value={location}
        maxLength={200}
        onChange={(event) => setLocation(event.target.value)}
        onKeyDown={handleKeyDown}
        error={fetcher.data?.errors?.location}
      />
      <Button type="button" onClick={submit} disabled={fetcher.state !== 'idle'}>
        {t('club.create')}
      </Button>
    </div>
  );
}
