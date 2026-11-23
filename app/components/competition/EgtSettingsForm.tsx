import { TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router';
import { FormField } from '~/components/FormField';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { FieldError } from '~/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import type { AttemptGradeCount } from '~/lib/contests.server';
import type { EgtConfig } from '~/modules/egt/module';
import { getAffectedGrades } from './egtConfig';
import { HonourPercentFields } from './HonourPercentFields';
import { TieBreakList } from './TieBreakList';
import { VaultFields } from './VaultFields';

const ROUNDINGS = ['round', 'ceil'] as const;
const PRECISIONS = ['2', '3'] as const;

/** Posts the whole config as JSON, which the server validates with the schema of the module. */
export function EgtSettingsForm({
  savedConfig,
  attemptGrades,
  canEdit,
  error,
}: {
  savedConfig: EgtConfig;
  attemptGrades: AttemptGradeCount[];
  canEdit: boolean;
  error?: string;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const [config, setConfig] = useState(savedConfig);
  const affected = getAffectedGrades(savedConfig, config, attemptGrades);

  return (
    <Form method="post" className="grid gap-6">
      <input type="hidden" name="config" value={JSON.stringify(config)} />

      <Card>
        <CardHeader>
          <CardTitle>{t('honour.title')}</CardTitle>
          <CardDescription>{t('honour.text')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <HonourPercentFields
            value={config.honourPercent}
            onChange={(honourPercent) => setConfig({ ...config, honourPercent })}
            disabled={!canEdit}
          />
          <FormField label={t('honour.rounding')}>
            {(props) => (
              <Select
                value={config.honourRounding}
                disabled={!canEdit}
                onValueChange={(honourRounding: EgtConfig['honourRounding']) =>
                  setConfig({ ...config, honourRounding })
                }
              >
                <SelectTrigger {...props} className="max-w-sm">
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
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('ranking.title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <FormField label={t('ranking.precision')}>
              {(props) => (
                <Select
                  value={String(config.precision)}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    setConfig({ ...config, precision: value === '3' ? 3 : 2 })
                  }
                >
                  <SelectTrigger {...props} className="max-w-sm">
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
            <section className="grid gap-3">
              <div className="grid gap-1">
                <h3 className="text-sm font-medium">{t('ranking.tieBreak')}</h3>
                <p className="text-sm text-muted-foreground">{t('ranking.tieBreakText')}</p>
              </div>
              <TieBreakList
                value={config.tieBreak}
                onChange={(tieBreak) => setConfig({ ...config, tieBreak })}
                disabled={!canEdit}
              />
            </section>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('vault.title')}</CardTitle>
            <CardDescription>{t('vault.text')}</CardDescription>
          </CardHeader>
          <CardContent>
            <VaultFields config={config} onChange={setConfig} disabled={!canEdit} />
          </CardContent>
        </Card>
      </div>

      {affected.recompute + affected.keep > 0 && (
        <Alert className="border-warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>{t('vault.warningTitle')}</AlertTitle>
          <AlertDescription>
            {affected.recompute > 0 && <p>{t('vault.recompute', { count: affected.recompute })}</p>}
            {affected.keep > 0 && <p>{t('vault.keep', { count: affected.keep })}</p>}
          </AlertDescription>
        </Alert>
      )}
      {error && <FieldError>{error}</FieldError>}
      {canEdit && (
        <SubmitButton className="justify-self-start">{t('common:actions.save')}</SubmitButton>
      )}
    </Form>
  );
}
