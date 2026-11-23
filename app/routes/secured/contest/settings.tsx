import { useTranslation } from 'react-i18next';
import { data, redirect } from 'react-router';
import type { Route } from './+types/settings';
import { EgtSettingsForm } from '~/components/competition/EgtSettingsForm';
import { PageHeader } from '~/components/PageHeader';
import { competitionContext, contestContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { parseJson } from '~/lib/competitionForm.server';
import { countAttemptGrades, updateContestConfig } from '~/lib/contests.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import type { EgtConfig } from '~/modules/egt/module';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function loader({ context }: Route.LoaderArgs) {
  const { id: competitionId } = context.get(competitionContext);
  const { id, name, module } = context.get(contestContext);
  return {
    contestId: id,
    name,
    module: module.key,
    // The page only shows it for this module.
    config: module.config as EgtConfig,
    attemptGrades: await countAttemptGrades(competitionId, id),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id: competitionId } = requireRole(context, 'EDITOR');
  const contest = context.get(contestContext);
  const t = getT(context);
  const config = parseJson((await request.formData()).get('config'));
  // updateContestConfig would take the default config.
  if (!config) return data({ error: t('domainErrors.INVALID_CONFIG') }, 400);

  try {
    const { recomputed } = await updateContestConfig(competitionId, contest.id, config);
    enqueueToast(context, {
      type: 'success',
      message:
        recomputed > 0
          ? t('settings:vault.recomputed', { count: recomputed })
          : t('settings:saved'),
    });
  } catch (error) {
    return data({ error: domainErrorMessage(error, t) }, 400);
  }
  return redirect('.');
}

export default function ContestSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation('settings');
  const { canEdit } = useCompetition();
  const { contestId, name, module, config, attemptGrades } = loaderData;

  return (
    <>
      <title>{`${t('contestTitle')} · UTEG`}</title>
      <PageHeader
        title={t('contestTitle')}
        description={canEdit ? name : `${name}. ${t('readOnly')}`}
      />
      {module === 'egt' && (
        <EgtSettingsForm
          key={contestId}
          savedConfig={config}
          attemptGrades={attemptGrades}
          canEdit={canEdit}
          error={actionData?.error}
        />
      )}
    </>
  );
}
