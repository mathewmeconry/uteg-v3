import { LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { FormField } from '~/components/FormField';
import { Button } from '~/components/ui/button';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { MAX_COVER_PAGES } from '~/lib/domain/cover';
import type { RankingTemplateOptions } from '~/lib/domain/rankingTemplate';
import { Section, SelectField } from './TemplateFields';

type Template = { id: string; coverPages: string[]; isCoverBroken: boolean };

/** Uploads are saved at once, unlike the options. */
export function CoverSection({
  template,
  options,
  onChange,
}: {
  template: Template | undefined;
  options: RankingTemplateOptions;
  onChange: (options: RankingTemplateOptions) => void;
}) {
  const { t } = useTranslation(['pdf', 'common']);
  return (
    <Section title={t('cover.title')}>
      {template ? (
        <Cover template={template} options={options} onChange={onChange} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('cover.saveFirst')}</p>
      )}
    </Section>
  );
}

function Cover({
  template: { id, coverPages, isCoverBroken },
  options,
  onChange,
}: {
  template: Template;
  options: RankingTemplateOptions;
  onChange: (options: RankingTemplateOptions) => void;
}) {
  const { t } = useTranslation(['pdf', 'common']);
  const { submit, pending, errors } = useActionFetcher();
  const [isDrawing, setIsDrawing] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const isBusy = isDrawing || pending;
  const input = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();
  const isFocused = searchParams.get('focus') === 'cover';

  useEffect(() => {
    // A copy usually gets another cover and category, which are next to each other.
    if (isFocused) input.current?.focus();
  }, [isFocused]);

  async function upload(file: File) {
    setFileError(undefined);
    setIsDrawing(true);
    try {
      // Only in the browser, and large.
      const { createCoverPages, CoverFileError } = await import('./coverPages.client');
      const formData = new FormData();
      formData.set('intent', 'cover');
      formData.set('id', id);
      try {
        for (const page of await createCoverPages(file)) formData.append('page', page, 'page.jpg');
      } catch (error) {
        if (!(error instanceof CoverFileError)) throw error;
        setFileError(t(`common:domainErrors.${error.code}`));
        return;
      }
      void submit(formData, { method: 'post', encType: 'multipart/form-data' });
    } catch {
      setFileError(t('common:errors.connection'));
    } finally {
      setIsDrawing(false);
    }
  }

  return (
    <>
      {coverPages.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <ul className="flex flex-wrap gap-2">
            {coverPages.map((assetId, index) => (
              <li key={assetId}>
                <img
                  src={`/api/assets/${assetId}`}
                  alt={t('cover.page', { number: index + 1 })}
                  className="h-32 max-w-full rounded-sm border bg-white object-contain"
                />
              </li>
            ))}
          </ul>
          <ConfirmDialog
            destructive
            title={t('cover.removeTitle')}
            confirmLabel={t('common:actions.remove')}
            fields={{ intent: 'removeCover', id }}
            trigger={
              <Button type="button" variant="outline" disabled={isBusy}>
                {t('common:actions.remove')}
              </Button>
            }
          />
        </div>
      )}
      {isCoverBroken && (
        <p role="alert" className="text-sm text-destructive">
          {t('cover.broken')}
        </p>
      )}
      <FormField
        label={coverPages.length > 0 ? t('cover.replace') : t('cover.file')}
        hint={t('cover.hint', { count: MAX_COVER_PAGES })}
        error={fileError ?? (isBusy ? undefined : errors?.cover)}
        ref={input}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        disabled={isBusy}
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          // The same file can be picked again.
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      {isBusy && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
          {t('common:saving')}
        </p>
      )}
      {coverPages.length > 0 && options.newPagePerCategory && (
        <SelectField
          label={t('cover.position')}
          value={options.cover}
          items={[
            ['once', t('cover.positions.once')],
            ['eachCategory', t('cover.positions.eachCategory')],
          ]}
          onChange={(cover) => onChange({ ...options, cover })}
        />
      )}
    </>
  );
}
