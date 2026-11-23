import { ExternalLinkIcon, FileTextIcon, RotateCcwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/judges';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { JudgeLinkCard } from '~/components/links/JudgeLinkCard';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { accessUrl, getOrCreateJudgeLinks, resetAllTokens, resetToken } from '~/lib/access.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { parseForm } from '~/lib/forms.server';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

// Whoever has a link can enter grades.
export async function loader({ context }: Route.LoaderArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const links = await getOrCreateJudgeLinks(id);
  return {
    links: links.map((link) => ({
      id: link.id,
      ground: link.ground,
      apparatus: link.apparatus!,
      url: accessUrl(link),
    })),
  };
}

const schema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('reset'), link: z.string().min(1) }),
  z.object({ intent: z.literal('resetAll') }),
]);

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const { data: values } = parseForm(await request.formData(), schema);
  if (!values) {
    enqueueToast(context, { type: 'error', message: t('common:errors.invalid') });
    return data(null, 400);
  }

  try {
    if (values.intent === 'resetAll') {
      await resetAllTokens(id, 'JUDGE');
      enqueueToast(context, { type: 'success', message: t('judging:links.resetAllDone') });
    } else {
      await resetToken(id, 'JUDGE', values.link);
      enqueueToast(context, { type: 'success', message: t('judging:links.resetDone') });
    }
    return data(null);
  } catch (error) {
    enqueueToast(context, { type: 'error', message: domainErrorMessage(error, t) });
    return data(null, 400);
  }
}

export default function Judges({ loaderData: { links } }: Route.ComponentProps) {
  const { t } = useTranslation(['judging', 'common']);
  const { competition } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const manualUrl = `/api/competitions/${competition.id}/pdf/judging-manual`;
  const grounds = [...new Set(links.map(({ ground }) => ground))];

  return (
    <>
      <title>{`${t('judgesTitle')} · UTEG`}</title>
      <PageHeader
        title={t('judgesTitle')}
        description={t('links.intro')}
        actions={
          <>
            <ConnectionBadge status={status} />
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  <RotateCcwIcon aria-hidden />
                  {t('links.resetAll')}
                </Button>
              }
              title={t('links.resetAllTitle')}
              description={t('links.resetAllText')}
              confirmLabel={t('links.resetAll')}
              destructive
              fields={{ intent: 'resetAll' }}
            />
          </>
        }
      />
      <Tabs defaultValue="1" className="gap-4">
        {grounds.length > 1 && (
          <TabsList
            aria-label={t('links.grounds')}
            className="h-auto max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto"
          >
            {grounds.map((ground) => (
              <TabsTrigger key={ground} value={String(ground)} className="min-h-10 flex-none px-4">
                {t('common:ground', { number: ground })}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {grounds.map((ground) => (
          <TabsContent key={ground} value={String(ground)} className="grid gap-4">
            <Button asChild variant="outline" className="justify-self-start">
              <a href={`${manualUrl}?ground=${ground}`} target="_blank" rel="noreferrer">
                <FileTextIcon aria-hidden />
                {t('links.manualGround', { number: ground })}
                <ExternalLinkIcon aria-hidden />
              </a>
            </Button>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4">
              {links
                .filter((link) => link.ground === ground)
                .map((link) => (
                  <JudgeLinkCard
                    key={link.id}
                    link={link}
                    manualUrl={`${manualUrl}?link=${link.id}`}
                  />
                ))}
            </ul>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
