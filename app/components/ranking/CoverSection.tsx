import { TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { FileDrop } from '~/components/FileDrop';
import { FormField } from '~/components/FormField';
import { SaveStatus } from '~/components/SaveStatus';
import { Alert, AlertDescription } from '~/components/ui/alert';
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
  // Until the cover changes, e.g. because it was removed.
  const cover = coverPages.join();
  const [failure, setFailure] = useState<{ cover: string; message: string }>();
  const fileError = failure?.cover === cover ? failure.message : undefined;
  const isBusy = isDrawing || pending;
  const input = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();
  const isFocused = searchParams.get('focus') === 'cover';

  useEffect(() => {
    // A copy usually gets another cover and category, which are next to each other.
    if (isFocused) input.current?.focus();
  }, [isFocused]);

  async function upload(file: File) {
    setFailure(undefined);
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
        setFailure({ cover, message: t(`common:domainErrors.${error.code}`) });
        return;
      }
      void submit(formData, { method: 'post', encType: 'multipart/form-data' });
    } catch {
      setFailure({ cover, message: t('common:errors.connection') });
    } finally {
      setIsDrawing(false);
    }
  }

  return (
    <>
      {coverPages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted p-4">
          <ul className="flex flex-wrap gap-3">
            {coverPages.map((assetId, index) => (
              <li key={assetId}>
                <img
                  src={`/api/assets/${assetId}`}
                  alt={t('cover.page', { number: index + 1 })}
                  className="h-36 max-w-full rounded-sm bg-white object-contain shadow-md"
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
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>{t('cover.broken')}</AlertDescription>
        </Alert>
      )}
      <FormField
        label={coverPages.length > 0 ? t('cover.replace') : t('cover.file')}
        hint={t('cover.hint', { count: MAX_COVER_PAGES })}
        error={fileError ?? (isBusy ? undefined : errors?.cover)}
      >
        {(props) => (
          <FileDrop
            {...props}
            text={t('cover.choose')}
            ref={input}
            accept="application/pdf,image/png,image/jpeg"
            disabled={isBusy}
            onChange={(event) => {
              const [file] = event.target.files ?? [];
              // The same file can be picked again.
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
        )}
      </FormField>
      {isBusy && <SaveStatus state="saving" />}
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
