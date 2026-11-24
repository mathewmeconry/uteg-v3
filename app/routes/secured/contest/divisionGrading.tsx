import { CheckIcon, UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import type { Route } from './+types/divisionGrading';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { EmptyState } from '~/components/EmptyState';
import { GradeGrid } from '~/components/grading/GradeGrid';
import { GradingSaveStatus } from '~/components/grading/GradingSaveStatus';
import { useGradeDrafts } from '~/components/grading/useGradeDrafts';
import { Button } from '~/components/ui/button';
import { competitionContext, contestContext } from '~/context';
import { useApparatusName } from '~/hooks/useApparatusName';
import { useCompetition } from '~/hooks/useCompetition';
import { readForm } from '~/lib/forms.server';
import { runConfirmRound, runDeleteGrade } from '~/lib/gradingActions.server';
import { getGradingState, getJudgingState } from '~/lib/judging.server';
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
    rounds: division.state === 'RUNNING' ? await getCurrentRounds(id, division) : [],
  };
}

/** The rounds to confirm, for all divisions that are judged together on the ground. */
async function getCurrentRounds(
  competitionId: string,
  { id, ground }: { id: string; ground: number },
) {
  const { apparatus } = await getJudgingState(competitionId, ground);
  return apparatus.flatMap(({ apparatus: key, currentRound, divisionIds, rounds }) => {
    if (currentRound === null || !divisionIds.includes(id)) return [];
    const slots = rounds[currentRound].slots.filter(({ withdrawn }) => !withdrawn);
    return {
      apparatus: key,
      round: currentRound,
      divisionIds: [...divisionIds],
      entryIds: slots.map(({ entryId }) => entryId),
      missing: slots.filter(({ grade }) => !grade).length,
    };
  });
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

export default function DivisionGrading({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(['judging', 'divisions', 'common']);
  const { competition, canEdit } = useCompetition();
  const apparatusName = useApparatusName();
  const { division, apparatus, rounds, loadedAt } = loaderData;

  const drafts = useGradeDrafts({
    url: `/api/competitions/${competition.id}/grades`,
    storageKey: `grading:${competition.id}`,
    loadedAt,
  });

  const name = t('division', {
    category: division.category,
    sex: t(`sexShort.${division.sex}`),
    number: division.number,
  });
  const hasStarters = apparatus.some((item) => item.rounds[0]?.slots.length > 0);
  const isRunning = division.state === 'RUNNING';

  function renderConfirm(key: string) {
    const current = rounds.find((item) => item.apparatus === key);
    if (!current) return null;
    const { round, divisionIds, entryIds, missing } = current;
    const slots = apparatus.find((item) => item.apparatus === key)?.rounds[round]?.slots ?? [];
    const hasUnsaved = slots.some(
      (slot) => entryIds.includes(slot.entryId) && drafts.get(slot).isDirty,
    );
    return (
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="outline" disabled={missing > 0 || hasUnsaved}>
            <CheckIcon aria-hidden />
            {t('grading.confirmShort', { number: round + 1 })}
            <span className="sr-only">{apparatusName(key)}</span>
          </Button>
        }
        title={t('grading.confirmTitle', { number: round + 1 })}
        description={t('grading.confirmText', { apparatus: apparatusName(key) })}
        confirmLabel={t('common:actions.confirm')}
        fields={{
          intent: 'confirm',
          ground: String(division.ground),
          apparatus: key,
          round: String(round),
          divisionIds,
        }}
      />
    );
  }

  return (
    <>
      <title>{`${t('gradingTitle')} ${name} · UTEG`}</title>
      {!hasStarters ? (
        <EmptyState
          icon={UsersIcon}
          title={t('grading.noLineups')}
          text={t('grading.noLineupsText')}
          action={
            <Button asChild variant="outline">
              <Link to="../lineups" relative="path">
                {t('divisions:lineupsTitle')}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {isRunning && (
                <>
                  <Legend className="bg-brand/30">{t('grading.stage.now')}</Legend>
                  <Legend className="bg-muted">{t('grading.stage.later')}</Legend>
                </>
              )}
              {canEdit && <span className="pointer-coarse:hidden">{t('grading.keys')}</span>}
            </div>
            <GradingSaveStatus drafts={drafts} />
          </div>
          <GradeGrid
            apparatus={apparatus}
            progress={division.progress}
            isRunning={isRunning}
            drafts={drafts}
            canEdit={canEdit}
            confirm={canEdit && isRunning ? renderConfirm : undefined}
          />
        </div>
      )}
    </>
  );
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`h-3.5 w-5 rounded-sm border ${className}`} />
      {children}
    </span>
  );
}
