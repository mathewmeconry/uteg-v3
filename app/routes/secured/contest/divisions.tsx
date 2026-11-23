import {
  FileTextIcon,
  LayersIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/divisions';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import {
  CreateDialog,
  DeleteDialog,
  GroundDialog,
  StartDialog,
  StopDialog,
} from '~/components/divisions/DivisionDialogs';
import { DivisionFilters } from '~/components/divisions/DivisionFilters';
import {
  FILTER_KEYS,
  filterDivisions,
  matchesSearch,
  sortDivisions,
  type Division,
} from '~/components/divisions/divisionList';
import { DivisionRow, type RowAction } from '~/components/divisions/DivisionRow';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { competitionContext, contestContext } from '~/context';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { actionError } from '~/lib/domainErrors.server';
import {
  createDivision,
  deleteDivisions,
  listDivisions,
  startDivisions,
  stopDivisions,
  updateDivision,
} from '~/lib/divisions.server';
import { DomainError } from '~/lib/errors';
import { safeClientAction } from '~/lib/safeClientAction';
import { cn } from '~/lib/utils';
import type { ServerT } from '~/locales';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function loader({ context }: Route.LoaderArgs) {
  const { id } = context.get(competitionContext);
  const contest = context.get(contestContext);
  const [divisions, running] = await Promise.all([
    listDivisions(id, { contestId: contest.id }),
    // The tablets on a ground show the running divisions of all contests.
    listDivisions(id, { state: 'RUNNING' }),
  ]);
  return {
    divisions,
    running,
    categories: {
      FEMALE: contest.module.categories('FEMALE'),
      MALE: contest.module.categories('MALE'),
    },
  };
}

const ground = z.coerce.number().int();
const division = z.array(z.string().min(1)).min(1);

const schema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('create'),
    category: z.string(),
    sex: z.enum(['FEMALE', 'MALE']),
    ground,
  }),
  z.object({ intent: z.literal('ground'), division, ground }),
  z.object({ intent: z.literal('delete'), division }),
  z.object({ intent: z.literal('start'), division, restart: z.stringbool().default(false) }),
  z.object({ intent: z.literal('stop'), division }),
]);

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const contest = context.get(contestContext);
  const t = getT(context);
  const formData = await request.formData();
  const { data: values } = schema.safeParse({
    ...Object.fromEntries(formData),
    division: [...new Set(formData.getAll('division'))],
  });
  if (!values) return data({ error: t('common:errors.invalid') }, 400);

  try {
    if ('division' in values) {
      const found = await listDivisions(id, { contestId: contest.id, ids: values.division });
      if (found.length !== values.division.length) throw new DomainError('NOT_FOUND');
    }
    const message = await run(id, contest.id, values, t);
    enqueueToast(context, { type: 'success', message });
    return null;
  } catch (error) {
    return actionError(error, t);
  }
}

export const clientAction = safeClientAction;

/** Returns what to tell the user. */
async function run(
  competitionId: string,
  contestId: string,
  values: z.infer<typeof schema>,
  t: ServerT,
): Promise<string> {
  switch (values.intent) {
    case 'create': {
      const { category, sex, number } = await createDivision(competitionId, contestId, values);
      const name = t('divisions:name', { category, sex: t(`common:sex.${sex}`), number });
      return t('divisions:create.done', { name });
    }
    case 'ground':
      await updateDivision(competitionId, values.division[0], { ground: values.ground });
      return t('divisions:ground.done');
    case 'delete':
      await deleteDivisions(competitionId, values.division);
      return t('divisions:remove.done', { count: values.division.length });
    case 'start':
      await startDivisions(competitionId, values.division, { restart: values.restart });
      return t('divisions:start.done', { count: values.division.length });
    case 'stop':
      await stopDivisions(competitionId, values.division);
      return t('divisions:stop.done', { count: values.division.length });
  }
}

type OpenDialog = {
  action: RowAction | 'create';
  ids: string[];
  /** Keeps the dialog as it was sent, live updates come before the answer. */
  sent?: Division[];
};

export default function Divisions({ loaderData }: Route.ComponentProps) {
  const { divisions, running, categories } = loaderData;
  const { t } = useTranslation(['divisions', 'common']);
  const { competition, canEdit } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const [params, setParams] = useSearchParams();
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [search, setSearch] = useState('');
  const { Form, pending } = useActionFetcher(() => setDialog(null));
  const divisionName = useDivisionName();
  const content = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const visible = sortDivisions(filterDivisions(divisions, params), params.get('sort')).filter(
    (item) => matchesSearch(searchText(item), search),
  );
  // Nothing happens to divisions the filter hides.
  const selected = visible.filter(({ id }) => selection.has(id));
  const selectedIds = selected.map(({ id }) => id);
  const pdfUrl = `/api/competitions/${competition.id}/pdf/judging-sheets`;

  function select(ids: string[], isSelected: boolean) {
    setSelection((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (isSelected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function searchText(item: Division) {
    const ground = t('common:ground', { number: item.ground });
    return `${divisionName(item)} ${ground} ${t(`common:divisionState.${item.state}`)}`;
  }

  function openDialog(action: OpenDialog['action'], ids: string[] = []) {
    const focused = document.activeElement;
    const menu = focused?.closest('[role=menu]');
    opener.current = menu
      ? document.getElementById(menu.getAttribute('aria-labelledby') ?? '')
      : (focused as HTMLElement | null);
    setDialog({ action, ids });
  }

  /** The dialogs have no trigger of their own, so Radix does not know where the focus was. */
  function restoreFocus(event: Event) {
    event.preventDefault();
    const target = opener.current;
    if (target?.isConnected && target !== document.body) target.focus();
    // Deleted, or the selection it belonged to is gone.
    if (document.activeElement !== target) content.current?.focus();
  }

  function resetFilters() {
    setSearch('');
    // The button disappears.
    content.current?.focus();
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of FILTER_KEYS) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  function sheetsHref(ids: string[]) {
    return `${pdfUrl}?${new URLSearchParams(ids.map((id) => ['division', id]))}`;
  }

  const createButton = canEdit && (
    <Button onClick={() => openDialog('create')}>
      <PlusIcon aria-hidden />
      {t('create.title')}
    </Button>
  );

  return (
    <>
      <title>{`${t('title')} · UTEG`}</title>
      <PageHeader
        title={t('title')}
        description={t('count', { count: divisions.length })}
        status={<ConnectionBadge status={status} />}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileTextIcon aria-hidden />
                  {t('sheets.title')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Array.from({ length: competition.grounds }, (_, index) => index + 1).map(
                  (number) => {
                    const label = t('sheets.ground', { number });
                    return running.some((item) => item.ground === number) ? (
                      <DropdownMenuItem key={number} asChild>
                        <a href={`${pdfUrl}?ground=${number}`} target="_blank" rel="noreferrer">
                          {label}
                        </a>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem key={number} disabled>
                        {label} ({t('sheets.nothingRuns')})
                      </DropdownMenuItem>
                    );
                  },
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Below in the empty state. */}
            {divisions.length > 0 && createButton}
          </>
        }
      />

      <div ref={content} tabIndex={-1} className="outline-none">
        {divisions.length === 0 ? (
          <EmptyState
            icon={LayersIcon}
            title={t('empty')}
            text={t('emptyText')}
            action={createButton}
          />
        ) : (
          <>
            <DivisionFilters
              divisions={divisions}
              grounds={competition.grounds}
              search={search}
              onSearch={setSearch}
            />
            {visible.length === 0 ? (
              <EmptyState
                title={t('noMatch')}
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    {t('resetFilters')}
                  </Button>
                }
              />
            ) : (
              <div className="rounded-xl border bg-card">
                <div
                  className={cn(
                    'sticky top-14 z-[5] flex min-h-12 flex-wrap items-center gap-2 rounded-t-xl border-b px-2 py-1 lg:top-0',
                    selected.length > 0 ? 'bg-ink text-ink-foreground' : 'bg-muted',
                  )}
                >
                  <label className="flex min-h-10 items-center pr-2 text-sm font-semibold">
                    <span className="flex size-11 items-center justify-center lg:size-9">
                      <Checkbox
                        checked={
                          selected.length === visible.length ||
                          (selected.length > 0 && 'indeterminate')
                        }
                        onCheckedChange={(checked) =>
                          select(
                            visible.map(({ id }) => id),
                            checked === true,
                          )
                        }
                      />
                    </span>
                    {selected.length > 0
                      ? t('selected', { count: selected.length })
                      : t('common:actions.selectAll')}
                  </label>
                  {selected.length > 0 && (
                    <>
                      {canEdit && selected.some(({ state }) => state !== 'RUNNING') && (
                        <Button
                          size="sm"
                          variant="brand"
                          onClick={() => openDialog('start', selectedIds)}
                        >
                          <PlayIcon aria-hidden />
                          {t('common:actions.start')}
                        </Button>
                      )}
                      {canEdit && selected.some(({ state }) => state === 'RUNNING') && (
                        <Button
                          size="sm"
                          variant="onInk"
                          onClick={() => openDialog('stop', selectedIds)}
                        >
                          <SquareIcon aria-hidden />
                          {t('common:actions.stop')}
                        </Button>
                      )}
                      {canEdit && selected.some(({ state }) => state !== 'RUNNING') && (
                        <Button
                          size="sm"
                          variant="onInk"
                          onClick={() => openDialog('delete', selectedIds)}
                        >
                          <TrashIcon aria-hidden />
                          {t('common:actions.delete')}
                        </Button>
                      )}
                      <Button asChild size="sm" variant="onInk">
                        <a href={sheetsHref(selectedIds)} target="_blank" rel="noreferrer">
                          <FileTextIcon aria-hidden />
                          {t('sheets.selected')}
                        </a>
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="onInk"
                        aria-label={t('clearSelection')}
                        onClick={() => setSelection(new Set())}
                      >
                        <XIcon aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
                <ul className="divide-y">
                  {visible.map((item) => (
                    <DivisionRow
                      key={item.id}
                      division={item}
                      canEdit={canEdit}
                      selected={selection.has(item.id)}
                      sheetsHref={sheetsHref([item.id])}
                      onSelect={(isSelected) => select([item.id], isSelected)}
                      onAction={(action) => openDialog(action, [item.id])}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      {renderDialog()}
    </>
  );

  function renderDialog() {
    if (!dialog) return null;
    const live = divisions.filter(({ id }) => dialog.ids.includes(id));
    const targets = (pending && dialog.sent) || live;
    const props = {
      Form,
      pending,
      onSubmit: () => setDialog({ ...dialog, sent: live }),
      onClose: () => setDialog(null),
      onCloseAutoFocus: restoreFocus,
    };
    const { grounds } = competition;
    switch (dialog.action) {
      case 'create':
        return <CreateDialog categories={categories} grounds={grounds} {...props} />;
      case 'start':
        return <StartDialog divisions={targets} running={running} {...props} />;
      case 'stop':
        return <StopDialog divisions={targets} {...props} />;
      case 'delete':
        return <DeleteDialog divisions={targets} {...props} />;
      case 'ground':
        // Somebody else may have deleted it.
        return targets.length > 0 ? (
          <GroundDialog division={targets[0]} grounds={grounds} {...props} />
        ) : null;
    }
  }
}
