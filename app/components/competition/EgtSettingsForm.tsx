import { TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, useNavigation, useRevalidator } from 'react-router';
import { FormActions } from '~/components/FormActions';
import { FormField } from '~/components/FormField';
import { Section, Sections } from '~/components/Section';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { useSexes } from '~/hooks/useSexes';
import type { EgtConfig } from '~/modules/egt/module';
import { isSameConfig } from './egtConfig';
import { HonourPercentFields } from './HonourPercentFields';
import { TieBreakList } from './TieBreakList';
import { VaultFields } from './VaultFields';

const ROUNDINGS = ['round', 'ceil'] as const;
const PRECISIONS = ['2', '3'] as const;

/** Posts the whole config as JSON, which the server validates with the schema of the module. */
export function EgtSettingsForm({
  savedConfig,
  version,
  canEdit,
  error,
}: {
  savedConfig: EgtConfig;
  version: string;
  canEdit: boolean;
  error?: string;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const sexes = useSexes();
  const { revalidate } = useRevalidator();
  const isSaving = useNavigation().formData !== undefined;
  const [config, setConfig] = useState(savedConfig);
  // What the changes were made on. Posting a newer version would overwrite what others saved.
  const [base, setBase] = useState({ config: savedConfig, version });
  const isDirty = !isSameConfig(config, base.config);

  if (version !== base.version && (!isDirty || isSameConfig(config, savedConfig))) {
    setBase({ config: savedConfig, version });
    setConfig(savedConfig);
  }
  const isOutdated = version !== base.version;

  function reload() {
    // Without changes the form takes over the saved config.
    setConfig(base.config);
    void revalidate();
  }

  return (
    <Form method="post" className="grid max-w-5xl grid-cols-1 gap-4">
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      <input type="hidden" name="version" value={base.version} />

      {/* What changes meanwhile would look like it was made on an outdated version. */}
      <fieldset disabled={isSaving} className="min-w-0">
        <Sections>
          <Section title={t('honour.title')} description={t('honour.text')}>
            <div className="grid grid-cols-1 gap-5">
              <HonourPercentFields
                sexes={sexes}
                value={config.honourPercent}
                onChange={(honourPercent) => setConfig({ ...config, honourPercent })}
                disabled={!canEdit}
              />
              <FormField label={t('honour.rounding')}>
                {(props) => (
                  <Select
                    value={config.honourRounding}
                    disabled={!canEdit || isSaving}
                    onValueChange={(honourRounding: EgtConfig['honourRounding']) =>
                      setConfig({ ...config, honourRounding })
                    }
                  >
                    <SelectTrigger {...props} className="w-full max-w-md min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUNDINGS.map((rounding) => (
                        <SelectItem key={rounding} value={rounding}>
                          {t(`honour.roundingOptions.${rounding}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>
          </Section>

          <Section title={t('ranking.title')}>
            <div className="grid grid-cols-1 gap-5">
              <FormField label={t('ranking.precision')}>
                {(props) => (
                  <Select
                    value={String(config.precision)}
                    disabled={!canEdit || isSaving}
                    onValueChange={(value) =>
                      setConfig({ ...config, precision: value === '3' ? 3 : 2 })
                    }
                  >
                    <SelectTrigger {...props} className="w-full max-w-md min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRECISIONS.map((precision) => (
                        <SelectItem key={precision} value={precision}>
                          {t(`ranking.precisionOptions.decimals${precision}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <div className="grid grid-cols-1 gap-3">
                <div className="grid gap-1">
                  <h3 className="text-sm font-semibold">{t('ranking.tieBreak')}</h3>
                  <p className="max-w-prose text-sm text-muted-foreground">
                    {t('ranking.tieBreakText')}
                  </p>
                </div>
                <TieBreakList
                  value={config.tieBreak}
                  onChange={(tieBreak) => setConfig({ ...config, tieBreak })}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </Section>

          <Section title={t('vault.title')} description={t('vault.text')}>
            <VaultFields config={config} onChange={setConfig} disabled={!canEdit || isSaving} />
          </Section>
        </Sections>
      </fieldset>

      {isDirty && (isOutdated || error) && (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>
            <p>{isOutdated ? t('common:domainErrors.CONFIG_CHANGED') : error}</p>
            <p>{t('reloadDiscards')}</p>
            <Button type="button" variant="outline" className="mt-2" onClick={reload}>
              {t('common:errors.reload')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {canEdit && (
        <FormActions>
          <SubmitButton>{t('common:actions.save')}</SubmitButton>
          {isDirty && <p className="text-sm text-muted-foreground">{t('unsaved')}</p>}
        </FormActions>
      )}
    </Form>
  );
}
