import { CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

/** Where one is in a form of several steps. With `onSelect` the earlier ones can be opened again. */
export function StepBar<Step extends string>({
  steps,
  current,
  onSelect,
}: {
  steps: readonly { key: Step; label: string }[];
  current: Step;
  onSelect?: (step: Step) => void;
}) {
  const { t } = useTranslation();
  const index = steps.findIndex(({ key }) => key === current);

  return (
    <div className="mb-5 grid gap-2">
      <p className="text-sm text-muted-foreground sm:sr-only" aria-live="polite">
        {t('stepOf', { step: index + 1, count: steps.length })}
        <span aria-hidden className="sm:hidden">{`: ${steps[index].label}`}</span>
      </p>
      <ol
        className="grid gap-1.5 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map(({ key, label }, position) => {
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  'block h-1.5 rounded-sm',
                  position <= index ? 'bg-primary' : 'bg-primary/15',
                )}
              />
              <span className="sr-only sm:not-sr-only sm:mt-2 sm:flex sm:items-center sm:gap-1.5">
                {position < index && (
                  <CheckIcon aria-hidden className="size-4 shrink-0 text-success" />
                )}
                <span className="truncate">{`${position + 1}. ${label}`}</span>
              </span>
            </>
          );
          const className = cn(
            'block w-full text-left text-sm max-sm:py-3 pointer-coarse:min-h-11',
            position > index && 'text-muted-foreground',
            position === index && 'font-semibold',
          );
          return (
            <li key={key} aria-current={position === index ? 'step' : undefined}>
              {onSelect ? (
                <button
                  type="button"
                  disabled={position >= index}
                  onClick={() => onSelect(key)}
                  className={cn(
                    className,
                    'rounded-sm enabled:cursor-pointer enabled:hover:text-primary',
                  )}
                >
                  {content}
                </button>
              ) : (
                <span className={className}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
