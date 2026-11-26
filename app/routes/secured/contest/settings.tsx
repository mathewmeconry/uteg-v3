import { useTranslation } from 'react-i18next';
import { data, redirect } from 'react-router';
import type { Route } from './+types/settings';
import { EgtSettingsForm } from '~/components/competition/EgtSettingsForm';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { PageHeader } from '~/components/PageHeader';
import { contestContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { parseJson } from '~/lib/competitionForm.server';
import { getConfigVersion, updateContestConfig } from '~/lib/contests.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import type { EgtConfig } from '~/modules/egt/module';
import { requirePermission } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function loader({ context }: Route.LoaderArgs) {
  const contest = context.get(contestContext);
  const { id, name, module } = contest;
  return {
    version: getConfigVersion(contest),
    contestId: id,
    name,
    module: module.key,
    // The page only shows it for this module.
    config: module.config as EgtConfig,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { id: competitionId } = requirePermission(context, 'edit');
  const contest = context.get(contestContext);
  const t = getT(context);
  const formData = await request.formData();
  const config = parseJson(formData.get('config'));
  const version = String(formData.get('version'));

  try {
    await updateContestConfig(competitionId, contest.id, config, { version });
    enqueueToast(context, { type: 'success', message: t('settings:saved') });
  } catch (error) {
    return data({ error: domainErrorMessage(error, t) }, 400);
  }
  return redirect('.');
}

export default function ContestSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation('settings');
  const { competition, can } = useCompetition();
  const canEdit = can('edit');
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const { contestId, name, module, config, version } = loaderData;

  return (
    <>
      <title>{`${t('contestTitle')} · UTEG`}</title>
      <PageHeader
        title={t('contestTitle')}
        description={canEdit ? name : `${name}. ${t('readOnly')}`}
        status={<ConnectionBadge status={status} />}
      />
      {module === 'egt' && (
        <EgtSettingsForm
          key={contestId}
          savedConfig={config}
          version={version}
          canEdit={canEdit}
          error={actionData?.error}
        />
      )}
    </>
  );
}
