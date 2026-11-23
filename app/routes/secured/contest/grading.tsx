import { CheckIcon, ClipboardPenIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import type { Route } from './+types/grading';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { EmptyState } from '~/components/EmptyState';
import { GradingTable } from '~/components/grading/GradingTable';
import { useGradeDrafts } from '~/components/grading/useGradeDrafts';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { competitionContext } from '~/context';
import { useApparatusName } from '~/hooks/useApparatusName';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { runConfirmRound, runDeleteGrade } from '~/lib/gradingActions.server';
import { getJudgingState } from '~/lib/judging.server';
import { requireRole } from '~/middlewares/competition.server';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { id, grounds } = context.get(competitionContext);
  const requested = Number(new URL(request.url).searchParams.get('ground'));
  const ground =
    Number.isInteger(requested) && requested >= 1 && requested <= grounds ? requested : 1;

  const loadedAt = Date.now();
  const { divisions, apparatus } = await getJudgingState(id, ground);
  return {
    ground,
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
  const formData = await request.formData();
  switch (formData.get('intent')) {
    case 'delete':
      return runDeleteGrade(context, id, formData);
    case 'confirm':
      return runConfirmRound(context, id, formData);
    default:
      throw data(null, 400);
  }
}

export default function Grading({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(['judging', 'common']);
  const { competition, canEdit } = useCompetition();
  const apparatusName = useApparatusName();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const { ground, divisions, apparatus, loadedAt } = loaderData;

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

  return (
    <>
      <title>{`${t('gradingTitle')} · UTEG`}</title>
      <PageHeader title={t('gradingTitle')} actions={<ConnectionBadge status={status} />} />
      {competition.grounds > 1 && (
        <nav aria-label={t('common:fields.ground')} className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: competition.grounds }, (_, index) => index + 1).map((number) => (
            <Button key={number} asChild variant={number === ground ? 'default' : 'outline'}>
              <Link
                to={{ search: `?ground=${number}` }}
                aria-current={number === ground ? 'page' : undefined}
                preventScrollReset
              >
                {t('common:ground', { number })}
              </Link>
            </Button>
          ))}
        </nav>
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
      ) : (
        <div className="grid gap-6">
          <p className="text-muted-foreground">
            {t('grading.text')}:{' '}
            {divisions
              .map(({ category, sex, number }) => `${category} ${t(`sexShort.${sex}`)} ${number}`)
              .join(', ')}
          </p>
          {apparatus.map(({ apparatus: key, rounds, currentRound, divisionIds }) => (
            <GradingTable
              key={`${ground}-${key}`}
              apparatus={key}
              rounds={rounds}
              currentRound={currentRound ?? rounds.length - 1}
              subtitle={
                currentRound === null
                  ? t('grading.finished')
                  : t('grading.currentRound', { number: currentRound + 1 })
              }
              drafts={drafts}
              canEdit={canEdit}
              footer={(round) => {
                if (!canEdit || round !== currentRound) return null;
                const isOpen = rounds[round].slots.some((slot) => {
                  const { saved, isDirty } = drafts.get(slot);
                  return !slot.withdrawn && (saved === null || isDirty);
                });
                return (
                  <div className="flex justify-end border-t px-4 py-3">
                    <ConfirmDialog
                      trigger={
                        <Button disabled={isOpen}>
                          <CheckIcon aria-hidden />
                          {t('grading.confirmRound', { number: round + 1 })}
                        </Button>
                      }
                      title={t('grading.confirmTitle', { number: round + 1 })}
                      description={t('grading.confirmText', { apparatus: apparatusName(key) })}
                      confirmLabel={t('common:actions.confirm')}
                      fields={{
                        intent: 'confirm',
                        ground: String(ground),
                        apparatus: key,
                        round: String(round),
                        divisionIds: [...divisionIds],
                      }}
                    />
                  </div>
                );
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
