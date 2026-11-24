import {
  DownloadIcon,
  FileTextIcon,
  LayersIcon,
  SheetIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, useFetcher, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Route } from './+types/starters';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { SelectionBar } from '~/components/SelectionBar';
import { AssignDialog } from '~/components/starters/AssignDialog';
import { keepPage, useActionError } from '~/components/starters/keepPage';
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
import { StarterPanel } from '~/components/starters/StarterPanel';
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
import { Role } from '~/generated/prisma/enums';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { listClubs } from '~/lib/clubs.server';
import { getContestOptions } from '~/lib/contestOptions.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { withoutNul } from '~/lib/domain/starter';
import { DomainError } from '~/lib/errors';
import { parseForm, rejectNul, type FieldErrors } from '~/lib/forms.server';
import {
  assignEntries,
  createStarter,
  getStarter,
  listStarters,
  updateStarter,
  withdrawStarters,
  type Assignment,
} from '~/lib/starters.server';
import type { ServerT } from '~/locales';
import { requireEditorOrCheckIn } from '~/middlewares/competition.server';
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
  const { id, role } = requireEditorOrCheckIn(context);
  const isCheckIn = role === Role.CHECK_IN;
  const t = getT(context);
  const formData = await request.formData();
  if (isCheckIn && !['create', 'update', 'remove'].includes(String(formData.get('intent')))) {
    throw data(null, 403);
  }
  rejectNul(formData);
  const success = (message: string) => {
    enqueueToast(context, { type: 'success', message });
    return { ok: true as const };
  };

  try {
    switch (formData.get('intent')) {
      case 'create': {
        const { data: values, errors } = parseForm(formData, starterFormSchema(t));
        if (errors) return data({ errors }, 400);
        const { contestId, category, divisionId, startApparatus, athleteId, ...person } = values;
        // Someone who comes back keeps what is left empty.
        const entry = {
          contestId,
          category: category || undefined,
          divisionId: (!isCheckIn && divisionId) || undefined,
          startApparatus: (!isCheckIn && startApparatus) || undefined,
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
        const { contestId, category, divisionId, startApparatus, athleteId: _, ...person } = values;
        const starter = await getStarter(id, starterId);
        const isInContest = starter.entries.some((entry) => entry.contestId === contestId);
        const entry = {
          contestId,
          category: category || null,
          // The check-in keeps them as far as they fit the category.
          divisionId: isCheckIn ? undefined : divisionId || null,
          startApparatus: isCheckIn ? undefined : startApparatus || null,
        };
        await updateStarter(id, starterId, {
          ...person,
          // Another sex would lose the division, which the check-in cannot assign again.
          sex: isCheckIn ? undefined : person.sex,
          entries: isInContest || category ? [entry] : [],
          updateAthlete: !isCheckIn && formData.get('updateAthlete') === 'on',
        });
        return success(t('starters:updated', { name: fullName(person) }));
      }
      case 'assign': {
        const assignments = parseAssignments(formData.get('assignments'));
        if (!assignments) return data({ error: t('errors.invalid') }, 400);
        await assignEntries(id, assignments);
        // The panel shows it.
        if (formData.has('quiet')) return { ok: true as const };
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
    const code = error instanceof DomainError && error.code;
    const errors: FieldErrors = {};
    if (code === 'STV_ID_CONFLICT') errors.stvId = t('starters:stvIdConflict');
    if (code === 'STARTER_REMOVED' || code === 'ATHLETE_ALREADY_STARTS') {
      errors.stvId = domainErrorMessage(error, t);
    }
    if (errors.stvId) return data({ errors }, 400);
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
    startApparatus: z.string().default(''),
  });
}

const id = withoutNul(z.string().min(1));
const assignmentsSchema = z
  .array(
    z.object({
      entryIds: z.array(id).min(1),
      divisionId: id,
      // Not sent: keep, null: none.
      startApparatus: id.nullish(),
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
  const { competition, contests, canEdit, isCheckIn } = useCompetition();
  const canEditPerson = canEdit || isCheckIn;
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
  // Other pages link to a starter with ?edit=<id>, and with the state { returnBack: true } when
  // closing the dialog should return to them.
  const editId = searchParams.get('edit');
  const [dialog, setDialog] = useState<OpenDialog | null>(() => {
    const starter = canEditPerson && starters.find(({ id }) => id === editId);
    return starter ? { type: 'edit', starter } : null;
  });
  // The search may link to one while this page is open.
  const [handledEditId, setHandledEditId] = useState(editId);
  if (editId !== handledEditId) {
    setHandledEditId(editId);
    const starter = canEditPerson && starters.find(({ id }) => id === editId);
    if (starter) setDialog({ type: 'edit', starter });
  }
  const listRef = useRef<HTMLElement>(null);

  function closeDialog() {
    setDialog(null);
    if (dialog?.type !== 'edit' || dialog.starter.id !== editId) return;
    if (location.state?.returnBack) return void navigate(-1);
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
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = canEdit && starters.find(({ id }) => id === openId);
  // Here, so that a failure is told when another person is open already.
  const assigner = useFetcher<typeof clientAction>();
  const assignError = useActionError(assigner.data);
  useEffect(() => {
    if (assignError) toast.error(assignError);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer, also when it is the same
  }, [assigner.data]);
  function assign(assignment: Assignment) {
    const assignments = JSON.stringify([assignment]);
    void assigner.submit({ intent: 'assign', assignments, quiet: '1' }, { method: 'post' });
  }
  const open = useCallback(
    (starter: StarterRow) => {
      // Where there is no room for the panel, or nothing to assign.
      if (isCheckIn || window.matchMedia('(width < 80rem)').matches) edit(starter);
      else setOpenId(starter.id);
    },
    [edit, isCheckIn],
  );
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

  const actions = canEditPerson && (
    <>
      {canEdit && (
        <Button variant="outline" asChild>
          <Link to={contests.length > 1 ? `import?contest=${contest.id}` : 'import'}>
            <UploadIcon aria-hidden />
            {t('common:actions.import')}
          </Link>
        </Button>
      )}
      <Button className="max-sm:grow" onClick={() => setDialog({ type: 'create' })}>
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
            {/* Below in the empty state. */}
            {starters.length > 0 && actions}
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
          <EmptyState
            icon={UsersIcon}
            title={t('emptyTitle')}
            text={canEdit && t('emptyText')}
            action={actions}
          />
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
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                {rows.length === 0 ? (
                  <EmptyState title={t('noMatchTitle')} text={t('noMatchText')} />
                ) : (
                  <StartersTable
                    rows={rows}
                    columns={columns}
                    sort={sort}
                    onSort={sortBy}
                    canEdit={canEditPerson}
                    selected={selected}
                    openId={openId}
                    onOpen={open}
                    onToggle={toggle}
                    onToggleAll={toggleAll}
                    onEdit={edit}
                    onRemove={remove}
                  />
                )}
              </div>
              {opened && (
                <StarterPanel
                  key={opened.id}
                  starter={opened}
                  options={contest}
                  pending={assigner.state !== 'idle'}
                  onAssign={assign}
                  onEdit={() => edit(opened)}
                  onClose={() => {
                    setOpenId(null);
                    listRef.current?.focus({ preventScroll: true });
                  }}
                />
              )}
            </div>
          </>
        )}
      </section>

      {canEditPerson && selectedRows.length > 0 && (
        <SelectionBar
          role="toolbar"
          aria-label={t('actions')}
          clearLabel={t('clearSelection')}
          onClear={() => {
            setSelected(new Set());
            listRef.current?.focus({ preventScroll: true });
          }}
          text={
            <p role="status">
              <strong>{t('selected', { count: selectedRows.length })}</strong>
              {hiddenCount > 0 && (
                <span className="block text-ink-muted">
                  {t('selectedHidden', { count: hiddenCount })}
                </span>
              )}
            </p>
          }
        >
          {canEdit && (
            <Button
              variant="brand"
              onClick={() => setDialog({ type: 'assign', starters: selectedRows })}
            >
              <LayersIcon aria-hidden />
              {t('assign.action')}
            </Button>
          )}
          <Button
            variant="onInk"
            onClick={() => setDialog({ type: 'remove', starters: selectedRows })}
          >
            <Trash2Icon aria-hidden />
            {t('common:actions.remove')}
          </Button>
        </SelectionBar>
      )}

      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <StarterDialog
          competitionId={competition.id}
          starter={dialog.type === 'edit' ? dialog.starter : undefined}
          options={contest}
          clubs={clubs}
          startingIds={startingIds}
          personOnly={isCheckIn}
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
