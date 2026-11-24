import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { categoryName } from '~/lib/categoryName';
import { parseGrade } from '~/lib/domain/grade';
import { formatEntered } from '~/lib/domain/gradeInput';
import { LANGUAGES, type Language } from '~/locales';
import { cn } from '~/lib/utils';
import { DEMO_STARTER, rankDemo } from './demoRanking';

/** What UTEG is, and a grade to enter that shows up everywhere. */
export function Hero({ language }: { language: Language }) {
  const { t } = useTranslation(['landing', 'common', 'auth', 'judging', 'ranking', 'display']);
  const [text, setText] = useState('9.45');
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<'INVALID' | 'RANGE' | 'PRECISION' | 'REQUIRED' | null>(null);

  const ranking = rankDemo(saved);
  const rank = ranking.find(({ name }) => name === DEMO_STARTER.name)!.rank;
  const grade = saved === null ? '–' : formatEntered(saved);
  const parsed = parseGrade(text);
  const isSaved = saved !== null && parsed.ok && parsed.value === saved;
  const floor = t('common:apparatus.boden');
  const category = `${categoryName('K5', t)} ${t('judging:sexShort.FEMALE')}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!parsed.ok) return setError(parsed.error);
    if (parsed.value === null) return setError('REQUIRED');
    setError(null);
    setSaved(parsed.value);
  }

  return (
    <section className="overflow-hidden bg-ink text-ink-foreground">
      <div className="relative mx-auto max-w-[77.5rem] px-4 sm:px-6">
        <header className="relative z-10 -mx-4 flex items-center gap-x-2 border-b border-ink-accent px-4 py-2 sm:-mx-6 sm:gap-x-4 sm:px-6 lg:mx-0 lg:border-0 lg:px-0 lg:py-5">
          <p className="flex-1 font-display text-3xl leading-none lg:flex-none">
            {t('common:appName')}
          </p>
          <nav aria-label={t('languages')} className="flex">
            {LANGUAGES.map((code) => (
              // A document load, so the language of the whole page changes at once.
              <a
                key={code}
                href={`/${code}`}
                hrefLang={code}
                lang={code}
                aria-current={code === language ? 'page' : undefined}
                className={cn(
                  'inline-flex size-11 items-center justify-center text-sm uppercase',
                  code === language ? 'font-semibold' : 'text-ink-muted hover:underline',
                )}
              >
                <span aria-hidden>{code}</span>
                <span className="sr-only normal-case">{t(`common:language.${code}`)}</span>
              </a>
            ))}
          </nav>
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center font-semibold whitespace-nowrap underline underline-offset-4 hover:no-underline"
          >
            {t('auth:loginTitle')}
          </Link>
        </header>

        <svg
          role="img"
          aria-label={t('demo.rings', { name: DEMO_STARTER.name, grade, rank })}
          viewBox="0 0 480 780"
          preserveAspectRatio="xMidYMax slice"
          className="mx-auto block aspect-[480/340] w-full max-w-md lg:absolute lg:top-0 lg:right-6 lg:aspect-[480/780] lg:w-[36%]"
        >
          <g fill="none" strokeLinecap="round">
            <path d="M122 -20v510M358 -20v510" strokeWidth="12" className="stroke-ink-accent" />
            <path d="M122 440v52M358 440v52" strokeWidth="22" className="stroke-brand" />
            <circle cx="122" cy="598" r="96" strokeWidth="24" className="stroke-brand" />
            <circle cx="358" cy="598" r="96" strokeWidth="24" className="stroke-brand" />
          </g>
          <g textAnchor="middle" className="fill-ink-foreground">
            <text x="122" y="612" fontSize="70" className="font-display">
              {grade}
            </text>
            <text x="358" y="612" fontSize="70" className="font-display">
              {rank}
            </text>
            <text x="122" y="644" fontSize="22" className="fill-ink-muted">
              {t('common:fields.grade')}
            </text>
            <text x="358" y="644" fontSize="22" className="fill-ink-muted">
              {t('ranking:rank')}
            </text>
          </g>
        </svg>

        <div className="flex flex-col items-start justify-end gap-4 pb-10 lg:min-h-[min(44rem,52vw)] lg:w-3/5 lg:gap-6">
          <p className="text-ink-muted lg:text-lg">{t('common:tagline')}</p>
          <h1 className="font-display text-[clamp(3.25rem,6.8vw,6.75rem)] leading-[0.94]">
            {t('title')}
          </h1>
          <p className="max-w-[46ch] text-ink-foreground/85 lg:text-lg">{t('intro')}</p>
          <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
            <Link to="/register">{t('start')}</Link>
          </Button>
        </div>

        <div className="pt-4 pb-14 lg:pb-18">
          <h2 className="font-display text-3xl">{t('demo.title')}</h2>
          <p className="mt-1 mb-4 text-ink-muted">
            {t('demo.text', { name: DEMO_STARTER.name.split(' ')[0] })}
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* First on phones, so it stays in sight above the keyboard. */}
            <div className="display-surface flex flex-col overflow-hidden rounded-2xl bg-(--panel) [color-scheme:dark] lg:order-2">
              <p className="flex items-baseline justify-between gap-2 bg-ink-accent px-4 py-1.5">
                <span className="font-display text-xl lg:text-2xl">{floor}</span>
                <span className="text-xs text-ink-foreground/85">{t('demo.display')}</span>
              </p>
              <div className="flex flex-1 items-center gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:justify-between lg:py-5">
                <div className="min-w-0 flex-1 lg:flex-none">
                  <p className="font-display text-2xl leading-tight lg:text-4xl">
                    {DEMO_STARTER.name}
                  </p>
                  <p className="text-sm text-ink-muted lg:text-lg">{DEMO_STARTER.club}</p>
                </div>
                <p
                  key={saved}
                  className="figure text-6xl leading-none text-brand new-grade lg:text-center lg:text-[8rem]"
                >
                  {grade}
                </p>
                <p className="hidden lg:block">
                  <span className="text-ink-muted">{t('display:next')}: </span>
                  <span className="font-semibold">Noemi Gerber</span>
                </p>
              </div>
            </div>

            <form
              noValidate
              onSubmit={submit}
              className="flex flex-col gap-3 rounded-2xl border-8 border-ink-accent bg-background p-4 text-foreground lg:order-1"
            >
              <p className="flex justify-between gap-2 text-sm text-muted-foreground">
                <span>{t('demo.tablet', { apparatus: floor })}</span>
                <span>{t('judging:position', { position: 3, total: 6 })}</span>
              </p>
              <div className="text-center">
                <p className="font-display text-4xl leading-tight">{DEMO_STARTER.name}</p>
                <p>
                  {DEMO_STARTER.club} · <span className="font-bold">{category}</span>
                </p>
              </div>
              <Label htmlFor="demo-grade">{t('judging:input.grade')}</Label>
              <Input
                id="demo-grade"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                aria-invalid={error !== null}
                aria-describedby="demo-status"
                onChange={(event) => {
                  setText(event.target.value);
                  setError(null);
                }}
                className="figure h-20 border-2 text-center text-5xl md:text-5xl"
              />
              <p
                id="demo-status"
                role="status"
                className={cn(
                  'flex min-h-11 items-center justify-center rounded-lg px-3 text-center font-semibold',
                  error
                    ? 'bg-destructive text-destructive-foreground'
                    : isSaved
                      ? 'bg-success text-success-foreground'
                      : 'bg-warning text-warning-foreground',
                )}
              >
                {error
                  ? t(`judging:input.errors.${error}`)
                  : isSaved
                    ? t('judging:save.saved', { grade })
                    : t('judging:save.unsaved')}
              </p>
              <Button type="submit" className="h-14 text-lg lg:mt-auto">
                {t('demo.save')}
              </Button>
            </form>

            <div className="overflow-hidden rounded-2xl bg-card text-card-foreground lg:order-3">
              <p className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
                <span className="font-display text-2xl">
                  {t('ranking:title')} {category}
                </span>
                <span className="text-sm text-muted-foreground">{t('demo.provisional')}</span>
              </p>
              <ol className="divide-y">
                {ranking.map((entry) => (
                  <li
                    key={entry.name}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 lg:py-4',
                      entry.name === DEMO_STARTER.name && 'bg-accent',
                    )}
                  >
                    <span className="figure w-6 text-2xl">{entry.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block leading-tight font-semibold">{entry.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {entry.club} · {t('common:apparatusShort.boden')} {entry.floor}
                      </span>
                    </span>
                    <span className="figure text-2xl">{entry.total}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
