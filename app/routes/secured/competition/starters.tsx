import {
  DownloadIcon,
  FileTextIcon,
  SheetIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/starters';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { AssignDialog } from '~/components/starters/AssignDialog';
import { keepPage } from '~/components/starters/keepPage';
import { NativeSelect } from '~/components/starters/NativeSelect';
import { postIds } from '~/components/starters/postIds';
import { RemoveDialog } from '~/components/starters/RemoveDialog';
import { StarterDialog } from '~/components/starters/StarterDialog';
import {
  COLUMNS,
  filterStarters,
  NO_FILTERS,
  sortStarters,
  type Column,
  type Sort,
} from '~/components/starters/starterList';
import { fullName, toStarterRow, type StarterRow } from '~/components/starters/starterRow';
import { StartersTable } from '~/components/starters/StartersTable';
import { StartersToolbar } from '~/components/starters/StartersToolbar';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { competitionContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { listClubs } from '~/lib/clubs.server';
import { getContestOptions } from '~/lib/contestOptions.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { parseForm } from '~/lib/forms.server';
import { hasNul, safeText } from '~/lib/safeText';
import {
  assignEntries,
  createStarter,
  getStarter,
  listStarters,
  updateStarter,
  withdrawStarters,
} from '~/lib/starters.server';
import type { ServerT } from '~/locales';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { id, contests } = context.get(competitionContext);
  const contestId = new URL(request.url).searchParams.get('contest') ?? contests[0]?.id;
  if (!contests.some((contest) => contest.id === contestId)) throw data(null, 404);

  const [starters, contest, clubs] = await Promise.all([
    listStarters(id),
    getContestOptions(id, contestId),
    listClubs(),
  ]);
  return { starters: starters.map((starter) => toStarterRow(starter, contestId)), contest, clubs };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const formData = await request.formData();
  if (hasNul(formData)) return data({ error: t('errors.invalid') }, 400);
  const success = (message: string) => {
    enqueueToast(context, { type: 'success', message });
    return { ok: true as const };
  };

  try {
    switch (formData.get('intent')) {
      case 'create': {
        const { data: values, errors } = parseForm(formData, starterFormSchema(t));
        if (errors) return data({ errors }, 400);
        const { contestId, category, divisionId, lineupId, athleteId, ...person } = values;
        // Someone who comes back keeps what is left empty.
        const entry = {
          contestId,
          category: category || undefined,
          divisionId: divisionId || undefined,
          lineupId: lineupId || undefined,
        };
        const { outcome } = await createStarter(id, { ...person, athleteId, entries: [entry] });
        const message = t(`starters:${outcome}`, { name: fullName(person) });
        enqueueToast(context, { type: outcome === 'existing' ? 'info' : 'success', message });
        return { ok: true as const };
      }
      case 'update': {
        const { data: values, errors } = parseForm(formData, starterFormSchema(t));
        if (errors) return data({ errors }, 400);
        const starterId = String(formData.get('starterId') ?? '');
        const { contestId, category, divisionId, lineupId, athleteId: _, ...person } = values;
        const starter = await getStarter(id, starterId);
        const isInContest = starter.entries.some((entry) => entry.contestId === contestId);
        const entry = {
          contestId,
          category: category || null,
          divisionId: divisionId || null,
          lineupId: lineupId || null,
        };
        await updateStarter(id, starterId, {
          ...person,
          entries: isInContest || category ? [entry] : [],
          updateAthlete: formData.get('updateAthlete') === 'on',
        });
        return success(t('starters:updated', { name: fullName(person) }));
      }
      case 'assign': {
        const assignments = parseAssignments(formData.get('assignments'));
        if (!assignments) return data({ error: t('errors.invalid') }, 400);
        await assignEntries(id, assignments);
        const count = assignments.reduce((sum, { entryIds }) => sum + entryIds.length, 0);
        return success(t('starters:assigned', { count }));
      }
      case 'remove': {
        const ids = formData.getAll('id').map(String);
        if (ids.length === 0) return data({ error: t('errors.invalid') }, 400);
        await withdrawStarters(id, ids);
        return success(t('starters:removed', { count: ids.length }));
      }
      default:
        return data({ error: t('errors.invalid') }, 400);
    }
  } catch (error) {
    return data({ error: domainErrorMessage(error, t) }, 400);
  }
}

export function clientAction({ serverAction }: Route.ClientActionArgs) {
  return keepPage(() => serverAction());
}

function starterFormSchema(t: ServerT) {
  const required = t('errors.required');
  const invalid = t('errors.invalid');
  const name = z.string().trim().min(1, required).max(100, invalid);
  return z.object({
    contestId: z.string(),
    athleteId: z.string().optional(),
    stvId: z.string().trim().max(50, invalid),
    firstname: name,
    lastname: name,
    birthYear: z
      .string()
      .trim()
      .min(1, required)
      .regex(/^(19|20)\d\d$/, invalid)
      .transform(Number),
    sex: z.enum(['FEMALE', 'MALE'], required),
    clubId: z.string({ error: required }).min(1, required),
    category: z.string().default(''),
    divisionId: z.string().default(''),
    lineupId: z.string().default(''),
  });
}

const assignmentsSchema = z
  .array(
    z.object({
      entryIds: z.array(safeText()).min(1),
      divisionId: safeText().min(1),
      // Not sent: keep, null: none.
      lineupId: safeText().min(1).nullish(),
    }),
  )
  .min(1);

function parseAssignments(value: FormDataEntryValue | null) {
  try {
    return assignmentsSchema.safeParse(JSON.parse(String(value))).data;
  } catch {
    return undefined;
  }
}

type OpenDialog =
  | { type: 'create' }
  | { type: 'edit'; starter: StarterRow }
  | { type: 'assign'; starters: StarterRow[] }
  | { type: 'remove'; starters: StarterRow[] };

export default function Starters({ loaderData }: Route.ComponentProps) {
  const { starters, contest, clubs } = loaderData;
  const { t } = useTranslation(['starters', 'common']);
  const { competition, contests, canEdit } = useCompetition();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  useLiveUpdates(`/api/events/${competition.id}`);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState<Sort>({ column: 'lastname', direction: 'asc' });
  const [columns, setColumns] = useState<Column[]>(
    COLUMNS.filter((column) => column !== 'location'),
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Other pages link to a starter with ?edit=<id>.
  const editId = searchParams.get('edit');
  const [dialog, setDialog] = useState<OpenDialog | null>(() => {
    const starter = canEdit && starters.find(({ id }) => id === editId);
    return starter ? { type: 'edit', starter } : null;
  });
  const listRef = useRef<HTMLElement>(null);

  function closeDialog() {
    setDialog(null);
    if (dialog?.type !== 'edit' || dialog.starter.id !== editId) return;
    // The first page of a tab has this key, there is nothing to return to.
    if (location.key !== 'default') return void navigate(-1);
    setSearchParams(
      (params) => {
        params.delete('edit');
        return params;
      },
      { replace: true },
    );
  }

  function forget(removed: StarterRow[]) {
    const ids = new Set(removed.map(({ id }) => id));
    setSelected((previous) => new Set([...previous].filter((id) => !ids.has(id))));
  }

  // Typing stays fluent, the list follows.
  const deferredSearch = useDeferredValue(search);
  const rows = useMemo(
    () =>
      sortStarters(
        filterStarters(starters, { search: deferredSearch, filters }),
        sort,
        contest.apparatus,
      ),
    [starters, deferredSearch, filters, sort, contest.apparatus],
  );
  const startingIds = useMemo(() => new Set(starters.map((row) => row.athleteId)), [starters]);
  // Someone else may have removed a selected starter.
  const selectedRows = starters.filter(({ id }) => selected.has(id));
  const hiddenCount = selectedRows.length - rows.filter(({ id }) => selected.has(id)).length;

  const toggle = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const edit = useCallback((starter: StarterRow) => setDialog({ type: 'edit', starter }), []);
  const remove = useCallback(
    (starter: StarterRow) => setDialog({ type: 'remove', starters: [starter] }),
    [],
  );

  function toggleAll() {
    const next = new Set(selected);
    const areAllSelected = rows.every(({ id }) => selected.has(id));
    for (const { id } of rows) {
      if (areAllSelected) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
  }

  function sortBy(column: Column) {
    const isSame = sort.column === column;
    setSort({ column, direction: isSame && sort.direction === 'asc' ? 'desc' : 'asc' });
  }

  function exportTo(path: string, target?: '_blank') {
    const ids = rows.map(({ id }) => id);
    postIds(`/api/competitions/${competition.id}/${path}`, ids, { contestId: contest.id, target });
  }

  const actions = canEdit && (
    <>
      <Button variant="outline" asChild>
        <Link to={contests.length > 1 ? `import?contest=${contest.id}` : 'import'}>
          <UploadIcon aria-hidden />
          {t('common:actions.import')}
        </Link>
      </Button>
      <Button onClick={() => setDialog({ type: 'create' })}>
        <UserPlusIcon aria-hidden />
        {t('create')}
      </Button>
    </>
  );

  return (
    <>
      <title>{`${t('title')} · UTEG`}</title>
      <PageHeader
        title={t('title')}
        description={
          starters.length > 0 && t('shown', { shown: rows.length, total: starters.length })
        }
        actions={
          <>
            {starters.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="pointer-coarse:min-h-11"
                    disabled={rows.length === 0}
                  >
                    <DownloadIcon aria-hidden />
                    {t('common:actions.export')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="font-normal text-muted-foreground">
                    {t('exportHint', { count: rows.length })}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => exportTo('starters.xlsx')}>
                    <SheetIcon aria-hidden />
                    {t('exportXlsx')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportTo('pdf/starters', '_blank')}>
                    <FileTextIcon aria-hidden />
                    {t('exportPdf')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {actions}
          </>
        }
      />

      {contests.length > 1 && (
        <NativeSelect
          aria-label={t('contest')}
          className="mb-4 max-w-xs"
          value={contest.id}
          onChange={(event) => setSearchParams({ contest: event.target.value })}
        >
          {contests.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
      )}

      <section ref={listRef} tabIndex={-1} aria-label={t('title')} className="outline-none">
        {starters.length === 0 ? (
          <EmptyState icon={UsersIcon} title={t('emptyTitle')} text={canEdit && t('emptyText')} />
        ) : (
          <>
            <StartersToolbar
              rows={starters}
              apparatus={contest.apparatus}
              search={search}
              onSearch={setSearch}
              filters={filters}
              onFilters={setFilters}
              sort={sort}
              onSort={setSort}
              columns={columns}
              onColumns={setColumns}
            />
            {rows.length === 0 ? (
              <EmptyState title={t('noMatchTitle')} text={t('noMatchText')} />
            ) : (
              <StartersTable
                rows={rows}
                columns={columns}
                sort={sort}
                onSort={sortBy}
                canEdit={canEdit}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onEdit={edit}
                onRemove={remove}
              />
            )}
          </>
        )}
      </section>

      {canEdit && selectedRows.length > 0 && (
        <div
          role="toolbar"
          aria-label={t('actions')}
          className="sticky bottom-4 z-10 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border bg-popover p-2 pl-4 shadow-lg"
        >
          <p
            role="status"
            className="basis-full text-center text-sm sm:mr-2 sm:basis-auto sm:text-left"
          >
            <strong>{t('selected', { count: selectedRows.length })}</strong>
            {hiddenCount > 0 && (
              <span className="block text-muted-foreground">
                {t('selectedHidden', { count: hiddenCount })}
              </span>
            )}
          </p>
          <Button onClick={() => setDialog({ type: 'assign', starters: selectedRows })}>
            {t('assign.action')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDialog({ type: 'remove', starters: selectedRows })}
          >
            <Trash2Icon aria-hidden />
            {t('common:actions.remove')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('clearSelection')}
            onClick={() => setSelected(new Set())}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      )}

      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <StarterDialog
          competitionId={competition.id}
          starter={dialog.type === 'edit' ? dialog.starter : undefined}
          options={contest}
          clubs={clubs}
          startingIds={startingIds}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'assign' && (
        <AssignDialog starters={dialog.starters} options={contest} onClose={closeDialog} />
      )}
      {dialog?.type === 'remove' && (
        <RemoveDialog
          starters={dialog.starters}
          onClose={closeDialog}
          onRemoved={() => forget(dialog.starters)}
          focusAfterwards={() => listRef.current?.focus()}
        />
      )}
    </>
  );
}
