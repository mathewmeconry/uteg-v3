import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import type { Phase } from '~/lib/domain/competitionPhase';
import { cn } from '~/lib/utils';

const STEPS = ['starters', 'divisions', 'judges', 'start', 'ranking'] as const;
type Step = (typeof STEPS)[number];

type SetupPhase = Exclude<Phase, 'running'>;

const CURRENT: Record<SetupPhase, Step> = {
  starters: 'starters',
  divisions: 'divisions',
  start: 'start',
  continue: 'start',
  ended: 'ranking',
};

/** The way from an empty competition to the printed ranking, with the step that is due. */
export function NextSteps({
  phase,
  base,
  contestId,
}: {
  phase: SetupPhase;
  base: string;
  contestId?: string;
}) {
  const { t } = useTranslation('competition');
  const currentIndex = STEPS.indexOf(CURRENT[phase]);
  const contestBase = contestId ? `${base}/contests/${contestId}` : base;
  const links: Record<Step, string> = {
    starters: `${base}/starters`,
    divisions: `${contestBase}/divisions`,
    judges: `${base}/judges`,
    start: `${contestBase}/divisions`,
    ranking: `${contestBase}/ranking`,
  };

  return (
    <ol className="divide-y overflow-hidden rounded-xl border bg-card">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        // Nothing tells whether the tablets are ready until the first division runs.
        const isDone = index < currentIndex && !(step === 'judges' && phase === 'start');
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3',
              isCurrent && 'bg-accent py-5',
            )}
          >
            <span
              className={cn(
                'figure grid size-8 shrink-0 place-items-center rounded-full border',
                isCurrent && 'border-primary bg-primary text-primary-foreground',
                isDone && 'border-transparent bg-success/12 text-success',
              )}
            >
              {isDone ? <CheckIcon aria-hidden className="size-4" /> : index + 1}
              {isDone && <span className="sr-only">{t('steps.done')}</span>}
            </span>
            <div className="min-w-0 flex-1 basis-40">
              <p className={cn('font-semibold', isCurrent && 'font-display text-lg leading-tight')}>
                {t(`steps.${step}`)}
              </p>
              {!isDone && (
                <p className={cn('text-sm text-muted-foreground', isCurrent && 'text-foreground')}>
                  {t(`steps.${step}Text`)}
                </p>
              )}
            </div>
            <Button
              asChild
              variant={isCurrent ? 'default' : 'ghost'}
              className={cn(!isCurrent && 'text-primary max-sm:hidden')}
            >
              <Link to={links[step]} aria-label={`${t('steps.open')}: ${t(`steps.${step}`)}`}>
                {t(`steps.${isCurrent ? 'go' : 'open'}`)}
                {isCurrent && <ArrowRightIcon aria-hidden />}
              </Link>
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
