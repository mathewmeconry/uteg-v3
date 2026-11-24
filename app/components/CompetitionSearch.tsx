import { SearchIcon, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { commandFilter } from '~/components/starters/starterList';
import { useReturnFocus } from '~/components/starters/useReturnFocus';
import { StatusBadge } from '~/components/StatusBadge';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { useApparatusName } from '~/hooks/useApparatusName';
import { useCompetition } from '~/hooks/useCompetition';
import type { SearchIndex } from '~/lib/searchIndex.server';

/** More would be a list to read instead of a result. */
const LIMIT = 12;

type Page = { to: string; label: string; icon: LucideIcon };

/** Finds people, divisions and pages of the competition. Opens with Ctrl+K. */
export function CompetitionSearch({ pages }: { pages: Page[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      // Another dialog stays the one to answer.
      if (!document.querySelector('[role=dialog], [role=alertdialog]')) setOpen(true);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label={t('actions.search')}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => setOpen(true)}
        className="flex size-10 items-center justify-center gap-2 rounded-md text-sm text-ink-muted hover:bg-ink-accent hover:text-ink-foreground xl:w-auto xl:border xl:border-ink-muted/50 xl:px-3 pointer-coarse:size-11 xl:pointer-coarse:w-auto"
      >
        <SearchIcon aria-hidden className="size-5 xl:size-4" />
        <span aria-hidden className="hidden items-baseline gap-6 xl:flex">
          {t('actions.search')}
          <kbd className="font-sans text-xs">Ctrl K</kbd>
        </span>
      </button>
      {open && <SearchDialog pages={pages} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Only rendered while it is open, so what it finds is up to date. */
function SearchDialog({ pages, onClose }: { pages: Page[]; onClose: () => void }) {
  const { t } = useTranslation();
  const returnFocus = useReturnFocus();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={returnFocus}
        className="top-16 translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{t('actions.search')}</DialogTitle>
        <DialogDescription className="sr-only">{t('search.hint')}</DialogDescription>
        <Results pages={pages} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function Results({ pages, onClose }: { pages: Page[]; onClose: () => void }) {
  const { t } = useTranslation(['common', 'divisions']);
  const { competition, contests, canEdit } = useCompetition();
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const navigate = useNavigate();
  const divisionName = useDivisionName();
  const apparatusName = useApparatusName();
  const [query, setQuery] = useState('');
  // What the arrow keys chose, until something else is typed.
  const [chosen, setChosen] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const base = `/competitions/${competition.id}`;

  useEffect(() => {
    const controller = new AbortController();
    // No fetcher: when it fails, the page with what was typed there would become an error page.
    fetch(`/api${base}/search`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then(setIndex)
      .catch(() => {
        if (!controller.signal.aborted) setHasFailed(true);
      });
    return () => controller.abort();
  }, [base]);

  function matches(...texts: (string | null | undefined)[]) {
    return commandFilter('', query, [texts.filter(Boolean).join(' ')]) === 1;
  }

  function go(to: string) {
    onClose();
    void navigate(to);
  }

  function divisionUrl({ id, contestId, state }: SearchIndex['divisions'][number]) {
    const page = state === 'PENDING' ? 'lineups' : 'grading';
    return `${base}/contests/${contestId}/divisions/${id}/${page}`;
  }

  function starterUrl({ id, contestId, division }: SearchIndex['starters'][number]) {
    if (division) return divisionUrl(division);
    const params = new URLSearchParams();
    if (contestId && contests.length > 1) params.set('contest', contestId);
    if (canEdit) params.set('edit', id);
    return `${base}/starters?${params}`;
  }

  /** Only with several of them. */
  function contestName(contestId: string) {
    return contests.length > 1 && contests.find(({ id }) => id === contestId)?.name;
  }

  const hasQuery = query.trim() !== '';
  const starters = hasQuery
    ? (index?.starters ?? [])
        .filter(({ name, clubName, category }) => matches(name, clubName, category))
        .slice(0, LIMIT)
    : [];
  const divisions = (index?.divisions ?? [])
    .filter((division) =>
      hasQuery
        ? matches(divisionName(division), t('ground', { number: division.ground }))
        : division.state === 'RUNNING',
    )
    .slice(0, LIMIT);
  const foundPages = pages.filter(({ label }) => matches(label));
  const values = [
    ...[...starters, ...divisions].map(({ id }) => id),
    ...foundPages.map(({ to }) => to),
  ];
  const isEmpty = values.length === 0;

  return (
    <Command
      shouldFilter={false}
      value={values.includes(chosen) ? chosen : (values[0] ?? '')}
      onValueChange={setChosen}
      className="[&_[data-slot=command-input-wrapper]]:h-14"
    >
      <CommandInput
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          setChosen('');
          list.current?.scrollTo({ top: 0 });
        }}
        placeholder={t('search.placeholder')}
        aria-label={t('actions.search')}
        // Below 16px phones zoom in.
        className="h-14 text-base"
      />
      <CommandList ref={list} className="max-h-[min(28rem,calc(100dvh-9rem))]">
        {starters.length > 0 && (
          <CommandGroup heading={t('search.people')}>
            {starters.map((starter) => {
              const { id, name, sex, clubName, category, division, apparatus } = starter;
              const group = category ? `${category} ${t(`sex.${sex}`)}` : null;
              return (
                <CommandItem key={id} value={id} onSelect={() => go(starterUrl(starter))}>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="truncate text-muted-foreground">
                      {[
                        clubName,
                        division ? divisionName(division) : (group ?? t('search.noCategory')),
                        division && contestName(division.contestId),
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </span>
                  {apparatus ? (
                    <StatusBadge tone="live">
                      {t('search.now', { apparatus: apparatusName(apparatus) })}
                    </StatusBadge>
                  ) : (
                    <span className="shrink-0 text-muted-foreground">
                      {division
                        ? t(`divisionState.${division.state}`)
                        : t('search.withoutDivision')}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {divisions.length > 0 && (
          <CommandGroup heading={t('nav.divisions')}>
            {divisions.map((division) => (
              <CommandItem
                key={division.id}
                value={division.id}
                onSelect={() => go(divisionUrl(division))}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {[divisionName(division), contestName(division.contestId)]
                    .filter(Boolean)
                    .join(', ')}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {t('ground', { number: division.ground })}, {t(`divisionState.${division.state}`)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {foundPages.length > 0 && (
          <CommandGroup heading={t('search.pages')}>
            {foundPages.map(({ to, label, icon: Icon }) => (
              <CommandItem key={to} value={to} onSelect={() => go(to)}>
                <Icon aria-hidden />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hasFailed ? (
          <p role="alert" className="px-4 py-8 text-center text-sm text-destructive">
            {t('search.failed')}
          </p>
        ) : (
          isEmpty && (
            <p role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">
              {index ? t('search.empty') : t('loading')}
            </p>
          )
        )}
      </CommandList>
    </Command>
  );
}
