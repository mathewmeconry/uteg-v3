import { ExternalLinkIcon, MonitorIcon, RotateCcwIcon, TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/displays';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { CopyButton } from '~/components/CopyButton';
import { EmptyState } from '~/components/EmptyState';
import { CreateDisplayDialog, QrDialog } from '~/components/links/DisplayDialogs';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import {
  accessUrl,
  createDisplay,
  deleteDisplay,
  listDisplays,
  resetToken,
} from '~/lib/access.server';
import { actionError } from '~/lib/domainErrors.server';
import { parseForm } from '~/lib/forms.server';
import { safeClientAction } from '~/lib/safeClientAction';
import type { ServerT } from '~/locales';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

export async function loader({ context }: Route.LoaderArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const displays = await listDisplays(id);
  return {
    displays: displays.map((link) => ({ id: link.id, ground: link.ground, url: accessUrl(link) })),
  };
}

const link = z.string().min(1);

const schema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('create'), ground: z.coerce.number().int() }),
  z.object({ intent: z.literal('reset'), link }),
  z.object({ intent: z.literal('delete'), link }),
]);

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const { data: values } = parseForm(await request.formData(), schema);
  if (!values) return data({ error: t('common:errors.invalid') }, 400);

  try {
    const message = await run(id, values, t);
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
  values: z.infer<typeof schema>,
  t: ServerT,
): Promise<string> {
  switch (values.intent) {
    case 'create':
      await createDisplay(competitionId, values.ground);
      return t('display:links.createDone');
    case 'reset':
      await resetToken(competitionId, 'DISPLAY', values.link);
      return t('display:links.resetDone');
    case 'delete':
      await deleteDisplay(competitionId, values.link);
      return t('display:links.deleteDone');
  }
}

export default function Displays({ loaderData: { displays } }: Route.ComponentProps) {
  const { t } = useTranslation(['display', 'common']);
  const { competition } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);

  return (
    <>
      <title>{`${t('title')} · UTEG`}</title>
      <PageHeader
        title={t('title')}
        description={t('links.intro')}
        status={<ConnectionBadge status={status} />}
        // Below in the empty state.
        actions={displays.length > 0 && <CreateDisplayDialog grounds={competition.grounds} />}
      />
      {displays.length === 0 ? (
        <EmptyState
          icon={MonitorIcon}
          title={t('links.empty')}
          text={t('links.emptyText')}
          action={<CreateDisplayDialog grounds={competition.grounds} />}
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {displays.map(({ id, ground, url }) => {
            // Not the position in the list, which changes when others are deleted.
            const label = t('links.name', { code: id.slice(-4) });
            const groundLabel = t('common:ground', { number: ground });
            const name = `${label}, ${groundLabel}`;
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3"
              >
                <div>
                  <h2 className="font-semibold">{groundLabel}</h2>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <QrDialog name={name} url={url} />
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('links.openFor', { name })}
                    >
                      <ExternalLinkIcon aria-hidden />
                      {t('common:actions.open')}
                    </a>
                  </Button>
                  <CopyButton value={url} size="sm" aria-label={t('links.copyFor', { name })} />
                  <span className="flex text-muted-foreground">
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('links.resetFor', { name })}
                        >
                          <RotateCcwIcon aria-hidden />
                        </Button>
                      }
                      title={t('links.resetTitle')}
                      description={t('links.resetText', { name })}
                      confirmLabel={t('common:actions.reset')}
                      destructive
                      fields={{ intent: 'reset', link: id }}
                    />
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('links.deleteFor', { name })}
                        >
                          <TrashIcon aria-hidden />
                        </Button>
                      }
                      title={t('links.deleteTitle')}
                      description={t('links.deleteText', { name })}
                      confirmLabel={t('common:actions.delete')}
                      destructive
                      fields={{ intent: 'delete', link: id }}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
