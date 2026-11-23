import { FileTextIcon, LayersIcon, PlayIcon, PlusIcon, SquareIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
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
import { FILTER_KEYS, filterDivisions, sortDivisions } from '~/components/divisions/divisionList';
import { DivisionRow, type RowAction } from '~/components/divisions/DivisionRow';
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
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import {
  createDivision,
  deleteDivision,
  listDivisions,
  startDivisions,
  stopDivisions,
  updateDivision,
} from '~/lib/divisions.server';
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
  if (!values) {
    enqueueToast(context, { type: 'error', message: t('common:errors.invalid') });
    return data(null, 400);
  }

  if ('division' in values) {
    const found = await listDivisions(id, { contestId: contest.id, ids: values.division });
    if (found.length !== values.division.length) throw data(null, 404);
  }

  try {
    const message = await run(id, contest.id, values, t);
    enqueueToast(context, { type: 'success', message });
    return data(null);
  } catch (error) {
    enqueueToast(context, { type: 'error', message: domainErrorMessage(error, t) });
    return data(null, 400);
  }
}

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
      await deleteDivision(competitionId, values.division[0]);
      return t('divisions:remove.done');
    case 'start':
      await startDivisions(competitionId, values.division, { restart: values.restart });
      return t('divisions:start.done', { count: values.division.length });
    case 'stop':
      await stopDivisions(competitionId, values.division);
      return t('divisions:stop.done', { count: values.division.length });
  }
}

type OpenDialog = { action: RowAction | 'create'; ids: string[] };

export default function Divisions({ loaderData }: Route.ComponentProps) {
  const { divisions, running, categories } = loaderData;
  const { t } = useTranslation(['divisions', 'common']);
  const { competition, canEdit } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const [params, setParams] = useSearchParams();
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const visible = sortDivisions(filterDivisions(divisions, params), params.get('sort'));
  // Nothing happens to divisions the filter hides.
  const selected = visible.filter(({ id }) => selection.has(id));
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

  function resetFilters() {
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
    <Button onClick={() => setDialog({ action: 'create', ids: [] })}>
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
        actions={
          <>
            <ConnectionBadge status={status} />
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
            {createButton}
          </>
        }
      />

      {divisions.length === 0 ? (
        <EmptyState
          icon={LayersIcon}
          title={t('empty')}
          text={t('emptyText')}
          action={createButton}
        />
      ) : (
        <>
          <DivisionFilters divisions={divisions} grounds={competition.grounds} />
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
              <div className="sticky top-14 z-[5] flex min-h-14 flex-wrap items-center gap-2 rounded-t-xl border-b bg-card px-2 py-1.5">
                <label className="flex min-h-11 items-center pr-2 text-sm font-medium">
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
                        onClick={() =>
                          setDialog({ action: 'start', ids: selected.map(({ id }) => id) })
                        }
                      >
                        <PlayIcon aria-hidden />
                        {t('common:actions.start')}
                      </Button>
                    )}
                    {canEdit && selected.some(({ state }) => state === 'RUNNING') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDialog({ action: 'stop', ids: selected.map(({ id }) => id) })
                        }
                      >
                        <SquareIcon aria-hidden />
                        {t('common:actions.stop')}
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={sheetsHref(selected.map(({ id }) => id))}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileTextIcon aria-hidden />
                        {t('sheets.selected')}
                      </a>
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
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
                    onAction={(action) => setDialog({ action, ids: [item.id] })}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {renderDialog()}
    </>
  );

  function renderDialog() {
    if (!dialog) return null;
    const onClose = () => setDialog(null);
    const targets = divisions.filter(({ id }) => dialog.ids.includes(id));
    if (dialog.action === 'create') {
      return (
        <CreateDialog categories={categories} grounds={competition.grounds} onClose={onClose} />
      );
    }
    // Deleted by someone else in the meantime.
    if (targets.length === 0) return null;
    switch (dialog.action) {
      case 'start':
        return <StartDialog divisions={targets} running={running} onClose={onClose} />;
      case 'stop':
        return <StopDialog divisions={targets} onClose={onClose} />;
      case 'delete':
        return <DeleteDialog division={targets[0]} onClose={onClose} />;
      case 'ground':
        return (
          <GroundDialog division={targets[0]} grounds={competition.grounds} onClose={onClose} />
        );
    }
  }
}
