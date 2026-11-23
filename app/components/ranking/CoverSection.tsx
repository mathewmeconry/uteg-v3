import { FileCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { ConfirmDialog } from '~/components/ConfirmDialog';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Button } from '~/components/ui/button';
import { MAX_COVER_PAGES } from '~/lib/domain/cover';
import type { RankingTemplateOptions } from '~/lib/domain/rankingTemplate';
import { Section, SelectField } from './TemplateFields';

/** Uploads are saved at once, unlike the options. */
export function CoverSection({
  template,
  options,
  onChange,
}: {
  template: { id: string; coverId: string | null } | undefined;
  options: RankingTemplateOptions;
  onChange: (options: RankingTemplateOptions) => void;
}) {
  const { t } = useTranslation(['pdf', 'common']);
  const fetcher = useFetcher<{ errors?: { cover?: string } }>();

  if (!template) {
    return (
      <Section title={t('cover.title')}>
        <p className="text-sm text-muted-foreground">{t('cover.saveFirst')}</p>
      </Section>
    );
  }
  return (
    <Section title={t('cover.title')}>
      {template.coverId && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2">
            <FileCheckIcon aria-hidden className="size-5 text-success" />
            {t('cover.exists')}
          </p>
          <ConfirmDialog
            destructive
            title={t('cover.removeTitle')}
            confirmLabel={t('common:actions.remove')}
            fields={{ intent: 'removeCover', id: template.id }}
            trigger={
              <Button type="button" variant="outline">
                {t('common:actions.remove')}
              </Button>
            }
          />
        </div>
      )}
      <fetcher.Form
        // Empties the file input after an upload.
        key={template.coverId}
        method="post"
        encType="multipart/form-data"
        className="grid gap-3"
      >
        <input type="hidden" name="intent" value="cover" />
        <input type="hidden" name="id" value={template.id} />
        <FormField
          label={template.coverId ? t('cover.replace') : t('cover.file')}
          hint={t('cover.hint', { count: MAX_COVER_PAGES })}
          error={fetcher.data?.errors?.cover}
          name="cover"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          required
        />
        <SubmitButton
          variant="outline"
          className="justify-self-start"
          pending={fetcher.state !== 'idle'}
        >
          {t('common:actions.upload')}
        </SubmitButton>
      </fetcher.Form>
      {template.coverId && options.newPagePerCategory && (
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
    </Section>
  );
}
