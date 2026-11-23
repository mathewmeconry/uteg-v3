import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import type { EgtConfig } from '~/modules/egt/module';
import type { Aggregation } from '~/modules/types';
import { getVaultRule, setVaultRule, VAULT_CATEGORIES } from './egtConfig';

const COMBINATIONS: Aggregation[] = ['MAX', 'AVG', 'MIN'];

/** Attempts and aggregation of the vault per category. */
export function VaultFields({
  config,
  onChange,
  disabled,
}: {
  config: EgtConfig;
  onChange: (config: EgtConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);

  return (
    <table className="w-full max-w-md table-fixed">
      <thead className="text-left text-sm text-muted-foreground">
        <tr>
          <th scope="col" className="w-9 pb-2 sm:w-14 font-medium">
            <span className="sr-only">{t('common:fields.category')}</span>
          </th>
          <th scope="col" className="w-20 pb-2 sm:w-24 font-medium">
            {t('vault.attempts')}
          </th>
          <th scope="col" className="pb-2 font-medium">
            {t('vault.aggregation')}
          </th>
        </tr>
      </thead>
      <tbody>
        {VAULT_CATEGORIES.map((category) => {
          const rule = getVaultRule(config, category);
          const options: Aggregation[] = rule.attempts === 1 ? ['NONE'] : COMBINATIONS;
          return (
            <tr key={category}>
              <th scope="row" className="py-1 text-left font-medium">
                {category}
              </th>
              <td className="py-1 pr-2">
                <Select
                  value={String(rule.attempts)}
                  disabled={disabled}
                  onValueChange={(attempts) =>
                    onChange(
                      setVaultRule(config, category, { ...rule, attempts: Number(attempts) }),
                    )
                  }
                >
                  <SelectTrigger
                    aria-label={t('vault.attemptsOf', { category })}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['1', '2', '3', '4'].map((attempts) => (
                      <SelectItem key={attempts} value={attempts}>
                        {attempts}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="py-1">
                <Select
                  value={rule.aggregation}
                  disabled={disabled || rule.attempts === 1}
                  onValueChange={(aggregation: Aggregation) =>
                    onChange(setVaultRule(config, category, { ...rule, aggregation }))
                  }
                >
                  <SelectTrigger
                    aria-label={t('vault.aggregationOf', { category })}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((aggregation) => (
                      <SelectItem key={aggregation} value={aggregation}>
                        {t(`vault.aggregations.${aggregation}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
