import { ExternalLinkIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import type { Sex } from '~/generated/prisma/enums';
import { rankingTemplateSchema, type RankingTemplateOptions } from '~/lib/domain/rankingTemplate';

export type PreviewGroup = {
  contestId: string;
  contestName: string;
  sex: Sex;
  category: string;
};

const SAMPLE = 'sample';
const DEBOUNCE_MS = 500;

const toKey = ({ contestId, sex, category }: PreviewGroup) => `${contestId} ${sex}:${category}`;

/** The PDF with the options as they are in the form, rendered by the server. */
export function TemplatePreview({
  competitionId,
  template,
  options,
  groups,
}: {
  competitionId: string;
  template: { id: string; coverPages: string[] } | undefined;
  options: RankingTemplateOptions;
  groups: PreviewGroup[];
}) {
  const { t } = useTranslation(['pdf', 'common']);
  const id = useId();
  const [source, setSource] = useState(SAMPLE);
  const showContest = new Set(groups.map(({ contestId }) => contestId)).size > 1;
  const { url, status } = usePreview(competitionId, options, source, template);

  return (
    <section aria-label={t('preview.title')} className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <Label htmlFor={id}>{t('preview.data')}</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id={id} className="w-64 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SAMPLE}>{t('preview.sample')}</SelectItem>
              {groups.map((group) => (
                <SelectItem key={toKey(group)} value={toKey(group)}>
                  {showContest && `${group.contestName}: `}
                  {group.category} {t(`sex.${group.sex}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {url && (
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon aria-hidden />
              {t('preview.open')}
            </a>
          </Button>
        )}
      </div>
      {status === 'failed' && (
        <p role="alert" className="text-sm text-destructive">
          {t('preview.failed')}
        </p>
      )}
      {/* Phones cannot show PDFs in a page, they open it with the button. */}
      <div className="relative hidden h-[75dvh] min-h-96 overflow-hidden rounded-xl border bg-muted md:block">
        {url && (
          <iframe
            title={t('preview.title')}
            src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            className="size-full"
          />
        )}
        {status === 'loading' && (
          <LoaderCircleIcon
            aria-label={t('common:loading')}
            className="absolute top-3 right-3 size-6 animate-spin rounded-full bg-card p-1"
          />
        )}
      </div>
    </section>
  );
}

function usePreview(
  competitionId: string,
  options: RankingTemplateOptions,
  source: string,
  template: { id: string; coverPages: string[] } | undefined,
) {
  const templateId = template?.id;
  // Pages of a replaced cover have other ids.
  const cover = template?.coverPages.join();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const serialized = JSON.stringify(options);

  useEffect(() => {
    // While something in the form is invalid the last preview stays.
    if (!rankingTemplateSchema.safeParse(JSON.parse(serialized)).success) return;
    const controller = new AbortController();

    async function load() {
      setStatus('loading');
      const body = new FormData();
      body.set('options', serialized);
      if (templateId && cover) body.set('template', templateId);
      if (source !== SAMPLE) {
        const [contestId, group] = source.split(' ');
        body.set('contest', contestId);
        body.set('group', group);
      }
      try {
        const response = await fetch(`/api/competitions/${competitionId}/pdf/ranking`, {
          method: 'POST',
          body,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        setUrl(URL.createObjectURL(blob));
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('failed');
      }
    }

    const timeout = setTimeout(() => void load(), DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [competitionId, serialized, source, templateId, cover]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return { url, status };
}
