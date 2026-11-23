import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { APPARATUS, type EgtApparatus } from '~/modules/egt/module';

/** The apparatus that decide on equal totals, in order. */
export function TieBreakList({
  value,
  onChange,
  disabled,
}: {
  value: EgtApparatus[];
  onChange: (value: EgtApparatus[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const unused = APPARATUS.filter((apparatus) => !value.includes(apparatus));

  function move(index: number, offset: 1 | -1) {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }

  return (
    <div className="grid gap-3">
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('ranking.tieBreakEmpty')}</p>
      ) : (
        <ol className="grid gap-2">
          {value.map((apparatus, index) => {
            const name = t(`common:apparatus.${apparatus}`);
            return (
              <li
                key={apparatus}
                className="flex min-h-11 items-center gap-1 rounded-md border py-1 pr-1 pl-3"
              >
                <span className="w-6 text-muted-foreground tabular-nums">{index + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {!disabled && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('ranking.moveUp', { apparatus: name })}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUpIcon aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('ranking.moveDown', { apparatus: name })}
                      disabled={index === value.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('ranking.removeApparatus', { apparatus: name })}
                      onClick={() => onChange(value.filter((item) => item !== apparatus))}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!disabled && unused.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unused.map((apparatus) => {
            const name = t(`common:apparatus.${apparatus}`);
            return (
              <Button
                key={apparatus}
                type="button"
                variant="outline"
                aria-label={t('ranking.addApparatus', { apparatus: name })}
                onClick={() => onChange([...value, apparatus])}
              >
                <PlusIcon aria-hidden />
                {name}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
