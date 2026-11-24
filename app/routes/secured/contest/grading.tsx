import { ClipboardPenIcon, UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link, useSearchParams } from 'react-router';
import type { Route } from './+types/grading';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { EmptyState } from '~/components/EmptyState';
import { GradingSaveStatus } from '~/components/grading/GradingSaveStatus';
import { RoundBoard } from '~/components/grading/RoundBoard';
import { useGradeDrafts } from '~/components/grading/useGradeDrafts';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { competitionContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { readForm } from '~/lib/forms.server';
import { runConfirmRound, runDeleteGrade } from '~/lib/gradingActions.server';
import { getJudgingState, listRunningDivisions } from '~/lib/judging.server';
import { safeClientAction } from '~/lib/safeClientAction';
import { requireRole } from '~/middlewares/competition.server';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { id, grounds } = context.get(competitionContext);
  const running = await listRunningDivisions(id);
  const requested = Number(new URL(request.url).searchParams.get('ground'));
  const ground =
    Number.isInteger(requested) && requested >= 1 && requested <= grounds
      ? requested
      : (running[0]?.ground ?? 1);

  const loadedAt = Date.now();
  const { divisions, apparatus } = await getJudgingState(id, ground);
  return {
    ground,
    running,
    loadedAt,
    divisions,
    apparatus: apparatus
      .filter(({ status }) => status !== 'WAITING')
      .map(({ rounds, ...state }) => ({
        ...state,
        rounds: rounds.map(({ round, slots }) => ({
          round,
          slots: slots.map((slot) => ({ ...slot, apparatus: state.apparatus })),
        })),
      })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const formData = await readForm(request);
  switch (formData.get('intent')) {
    case 'delete':
      return runDeleteGrade(context, id, formData);
    case 'confirm':
      return runConfirmRound(context, id, formData);
    default:
      throw data(null, 400);
  }
}

export const clientAction = safeClientAction;

export default function Grading({ loaderData, params: { contestId } }: Route.ComponentProps) {
  const { t } = useTranslation(['judging', 'divisions', 'common']);
  const { competition, canEdit } = useCompetition();
  const [, setSearchParams] = useSearchParams();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const { ground, running, divisions, apparatus, loadedAt } = loaderData;

  const drafts = useGradeDrafts({
    url: `/api/competitions/${competition.id}/grades`,
    storageKey: `grading:${competition.id}`,
    loadedAt,
  });

  const hasStarters = apparatus.some(({ rounds }) => rounds.some(({ slots }) => slots.length > 0));
  const grounds = Array.from({ length: competition.grounds }, (_, index) => {
    const number = index + 1;
    return { number, divisions: running.filter((division) => division.ground === number) };
  });
  const inUse = grounds.filter((item) => item.divisions.length > 0);
  const free = grounds.filter((item) => item.divisions.length === 0);

  function listNames(items: typeof running) {
    return items
      .map(({ category, sex, number }) => `${category} ${t(`sexShort.${sex}`)} ${number}`)
      .join(', ');
  }

  function groundItem({ number, divisions: here }: (typeof grounds)[number]) {
    return (
      <SelectItem key={number} value={String(number)}>
        {t('common:ground', { number })}
        {here.length > 0 && ` · ${listNames(here)}`}
      </SelectItem>
    );
  }

  return (
    <>
      <title>{`${t('gradingTitle')} · UTEG`}</title>
      <PageHeader
        breadcrumbs={[
          {
            to: `/competitions/${competition.id}/contests/${contestId}/divisions`,
            label: t('common:nav.divisions'),
          },
        ]}
        title={t('gradingTitle')}
        actions={
          <>
            <GradingSaveStatus drafts={drafts} />
            <ConnectionBadge status={status} />
          </>
        }
      />
      {competition.grounds > 1 && (
        <Select
          value={String(ground)}
          onValueChange={(value) =>
            setSearchParams({ ground: value }, { preventScrollReset: true })
          }
        >
          <SelectTrigger aria-label={t('common:fields.ground')} className="mb-4 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {inUse.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t('grading.inUse')}</SelectLabel>
                {inUse.map(groundItem)}
              </SelectGroup>
            )}
            {free.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t('grading.free')}</SelectLabel>
                {free.map(groundItem)}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      )}

      {divisions.length === 0 ? (
        <EmptyState
          icon={ClipboardPenIcon}
          title={t('grading.nothingRuns')}
          text={t('grading.nothingRunsText')}
          action={
            <Button asChild variant="outline">
              <Link to="../divisions" relative="path">
                {t('grading.toDivisions')}
              </Link>
            </Button>
          }
        />
      ) : !hasStarters ? (
        <EmptyState
          icon={UsersIcon}
          title={t('grading.noLineups')}
          text={t('grading.noLineupsText')}
          action={
            <Button asChild variant="outline">
              <Link
                to={`/competitions/${competition.id}/contests/${divisions[0].contestId}/divisions/${divisions[0].id}/lineups`}
              >
                {t('divisions:lineupsTitle')}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {competition.grounds === 1 && (
            <p className="text-muted-foreground">{listNames(running)}</p>
          )}
          <RoundBoard
            key={ground}
            ground={ground}
            apparatus={apparatus}
            drafts={drafts}
            canEdit={canEdit}
          />
          {canEdit && (
            <p className="text-sm text-muted-foreground pointer-coarse:hidden">
              {t('grading.keys')}
            </p>
          )}
        </div>
      )}
    </>
  );
}
