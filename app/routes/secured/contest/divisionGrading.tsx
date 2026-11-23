import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import type { Route } from './+types/divisionGrading';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { DivisionStateBadge } from '~/components/DivisionStateBadge';
import { GradingSaveStatus } from '~/components/grading/GradingSaveStatus';
import { GradingTable } from '~/components/grading/GradingTable';
import { useGradeDrafts } from '~/components/grading/useGradeDrafts';
import { PageHeader } from '~/components/PageHeader';
import { competitionContext, contestContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { readForm } from '~/lib/forms.server';
import { runDeleteGrade } from '~/lib/gradingActions.server';
import { getGradingState } from '~/lib/judging.server';
import { safeClientAction } from '~/lib/safeClientAction';
import { requireRole } from '~/middlewares/competition.server';

export async function loader({ context, params: { divisionId } }: Route.LoaderArgs) {
  const { id } = context.get(competitionContext);
  const contest = context.get(contestContext);
  const loadedAt = Date.now();
  const { divisions, apparatus } = await getGradingState(id, { divisionIds: [divisionId] });
  const [division] = divisions;
  if (division?.contestId !== contest.id) throw data(null, 404);
  return {
    loadedAt,
    division,
    apparatus: apparatus.map(({ apparatus: key, rounds }) => ({
      apparatus: key,
      rounds: rounds.map(({ round, slots }) => ({
        round,
        slots: slots.map((slot) => ({ ...slot, apparatus: key })),
      })),
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const formData = await readForm(request);
  if (formData.get('intent') !== 'delete') throw data(null, 400);
  return runDeleteGrade(context, id, formData);
}

export const clientAction = safeClientAction;

export default function DivisionGrading({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(['judging', 'common']);
  const { competition, canEdit } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const { division, apparatus, loadedAt } = loaderData;

  const slots = useMemo(
    () => apparatus.flatMap(({ rounds }) => rounds.flatMap((round) => round.slots)),
    [apparatus],
  );
  const drafts = useGradeDrafts({
    url: `/api/competitions/${competition.id}/grades`,
    prefix: `grading:${competition.id}`,
    slots,
    loadedAt,
    status,
  });

  const name = t('division', {
    category: division.category,
    sex: t(`sexShort.${division.sex}`),
    number: division.number,
  });
  return (
    <>
      <title>{`${t('gradingTitle')} ${name} · UTEG`}</title>
      <PageHeader
        title={`${t('gradingTitle')}: ${name}`}
        description={t('grading.divisionText')}
        actions={
          <>
            <GradingSaveStatus drafts={drafts} />
            <DivisionStateBadge state={division.state} />
            <ConnectionBadge status={status} />
          </>
        }
      />
      <div className="grid gap-6">
        {canEdit && (
          <p className="text-sm text-muted-foreground pointer-coarse:hidden">{t('grading.keys')}</p>
        )}
        {apparatus.map(({ apparatus: key, rounds }) => (
          <GradingTable
            key={`${division.id}-${key}`}
            apparatus={key}
            rounds={rounds}
            currentRound={division.progress[key] ?? 0}
            drafts={drafts}
            canEdit={canEdit}
          />
        ))}
      </div>
    </>
  );
}
