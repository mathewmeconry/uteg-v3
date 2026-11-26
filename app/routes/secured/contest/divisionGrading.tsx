import { CheckIcon, UsersIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link, useOutletContext } from 'react-router';
import type { Route } from './+types/divisionGrading';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { EmptyState } from '~/components/EmptyState';
import { GradeGrid } from '~/components/grading/GradeGrid';
import { isUntouched, type GradeDrafts } from '~/components/grading/useGradeDrafts';
import { Button } from '~/components/ui/button';
import { competitionContext, contestContext } from '~/context';
import { useApparatusName } from '~/hooks/useApparatusName';
import { useCompetition } from '~/hooks/useCompetition';
import { readForm } from '~/lib/forms.server';
import { runConfirmRound, runDeleteGrade } from '~/lib/gradingActions.server';
import { getGradingState, getJudgingState } from '~/lib/judging.server';
import { safeClientAction } from '~/lib/safeClientAction';
import { categoryName } from '~/lib/categoryName';
import { cn } from '~/lib/utils';
import { requirePermission } from '~/middlewares/competition.server';

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
  const { apparatus, divisions } = await getJudgingState(competitionId, ground);
  return apparatus.flatMap(({ apparatus: key, currentRound, divisionIds, rounds }) => {
    if (currentRound === null || !divisionIds.includes(id)) return [];
    const slots = rounds[currentRound].slots.filter(({ withdrawn }) => !withdrawn);
    return {
      apparatus: key,
      round: currentRound,
      divisionIds: [...divisionIds],
      others: divisions
        .filter((division) => division.id !== id && divisionIds.includes(division.id))
        .map(({ category, sex, number }) => ({ category, sex, number })),
      entryIds: slots.map(({ entryId }) => entryId),
      missing: slots.filter(({ grade }) => !grade).length,
    };
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requirePermission(context, 'edit');
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
  const canEdit = useCompetition().can('edit');
  const apparatusName = useApparatusName();
  const divisionName = useDivisionName();
  const { division, apparatus, rounds } = loaderData;
  const drafts = useOutletContext<GradeDrafts>();

  const name = t('division', {
    category: categoryName(division.category, t),
    sex: t(`sexShort.${division.sex}`),
    number: division.number,
  });
  const hasStarters = apparatus.some((item) => item.rounds[0]?.slots.length > 0);
  const isRunning = division.state === 'RUNNING';

  function renderConfirm(key: string) {
    const current = rounds.find((item) => item.apparatus === key);
    if (!current) return null;
    const { round, divisionIds, others, entryIds, missing } = current;
    // Also of the other divisions, which are not in this grid.
    const hasUnsaved = [...drafts.drafts.values()].some(
      (draft) => draft.apparatus === key && entryIds.includes(draft.entryId) && !isUntouched(draft),
    );
    const names = others.map((other) => divisionName(other)).join(', ');
    const text = t('grading.confirmText', { apparatus: apparatusName(key) });
    return (
      <div className="grid justify-items-start gap-1">
        <ConfirmDialog
          // A dialog that is open must not become the one of the next round.
          key={[round, ...divisionIds].join(' ')}
          trigger={
            <Button size="sm" variant="outline" disabled={missing > 0 || hasUnsaved}>
              <CheckIcon aria-hidden />
              {t('grading.confirmShort', { number: round + 1 })}
              <span className="sr-only">{apparatusName(key)}</span>
            </Button>
          }
          title={t('grading.confirmTitle', { number: round + 1 })}
          description={names ? `${text} ${t('grading.confirmOthers', { names })}` : text}
          confirmLabel={t('common:actions.confirm')}
          fields={{
            intent: 'confirm',
            ground: String(division.ground),
            apparatus: key,
            round: String(round),
            divisionIds,
          }}
        />
        {missing > 0 && (
          <span className="text-xs font-normal text-muted-foreground">
            {t('grading.missing', { count: missing })}
            {names && ` (${t('grading.missingWith', { names })})`}
          </span>
        )}
      </div>
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
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {isRunning && (
              <>
                <Legend stage="now" />
                <Legend stage="later" />
              </>
            )}
            {canEdit && <span className="pointer-coarse:hidden">{t('grading.keys')}</span>}
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

/** Looks like the cells of the grid. */
function Legend({ stage }: { stage: 'now' | 'later' }) {
  const { t } = useTranslation('judging');
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          'h-4 w-6 rounded-sm border p-0.5',
          stage === 'now' ? 'bg-brand/15' : 'bg-muted',
        )}
      >
        {stage === 'now' && <span className="block size-1.5 rounded-full bg-brand" />}
      </span>
      {t(`grading.stage.${stage}`)}
    </span>
  );
}
