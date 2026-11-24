import { ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, redirect } from 'react-router';
import type { CSSProperties, ReactNode } from 'react';
import type { Route } from './+types/landing';
import { ApparatusPanel } from '~/components/display/ApparatusPanel';
import { Hero } from '~/components/landing/Hero';
import { Rings } from '~/components/Rings';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { i18nContext, languageContext, userContext } from '~/context';
import { categoryName } from '~/lib/categoryName';
import { APP_ORIGIN } from '~/lib/env.server';
import { createI18n } from '~/lib/i18n';
import { cn } from '~/lib/utils';
import { isLanguage, LANGUAGES, type Language } from '~/locales';
import { getT, languageCookie } from '~/middlewares/i18n.server';

const FAQ = ['cost', 'devices', 'judges', 'offline', 'reload', 'languages'] as const;

const IMPORTED = [
  { name: 'Lea Brunner', birthYear: 2014, club: 'TV Lenzburg', category: 'K5' },
  { name: 'Mia Frei', birthYear: 2013, club: 'TV Muri', category: 'K5' },
  { name: 'Noemi Gerber', birthYear: 2014, club: 'STV Wettingen', category: null },
  { name: 'Nina Egli', birthYear: 2014, club: 'TV Zofingen', category: 'K5' },
];

const PANELS = [
  { apparatus: 'reck', grade: 9050, first: 'Anna Caduff, TV Brugg', next: 'Julia Ammann, TV Muri' },
  {
    apparatus: 'boden',
    grade: 9250,
    first: 'Elin Dubach, STV Baden',
    next: 'Noemi Gerber, STV Wettingen',
  },
  {
    apparatus: 'schaukelringe',
    grade: 9200,
    first: 'Zoé Huber, TV Wohlen',
    next: 'Lara Frei, TV Brugg',
  },
  { apparatus: 'sprung', grade: 9400, first: 'Mia Brunner, TV Muri', next: 'Sara Egli, STV Baden' },
].map(({ apparatus, grade, first, next }) => ({
  apparatus,
  slots: [createSlot(first, { value: grade }), createSlot(next, null)],
}));

const RANKING = [
  { name: 'Lea Brunner', club: 'TV Lenzburg', award: 'GOLD', total: '37.10' },
  { name: 'Mia Frei', club: 'TV Muri', award: 'SILVER', total: '37.00' },
  { name: 'Nina Egli', club: 'TV Zofingen', award: 'BRONZE', total: '36.80' },
] as const;

/** The address decides about the language, whatever the visitor chose before. */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    if (context.get(userContext)) throw redirect('/home');
    const language = getLanguage(request);
    context.set(languageContext, language);
    context.set(i18nContext, createI18n(language));
    const response = await next();
    // Also for the pages that follow, e.g. to register.
    response.headers.append('Set-Cookie', await languageCookie.serialize(language));
    return response;
  },
];

export function loader({ context }: Route.LoaderArgs) {
  const t = getT(context);
  return {
    origin: APP_ORIGIN,
    language: context.get(languageContext),
    title: t('landing:metaTitle'),
    description: t('landing:metaDescription'),
  };
}

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  if (!loaderData) return [];
  const { origin, language, title, description } = loaderData;
  const url = `${origin}/${language}`;
  return [
    { title },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: url },
    ...LANGUAGES.map((code) => ({
      tagName: 'link' as const,
      rel: 'alternate',
      hrefLang: code,
      href: `${origin}/${code}`,
    })),
    // Redirects to the language of the visitor.
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: `${origin}/` },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'UTEG' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:locale', content: `${language}_CH` },
    { property: 'og:image', content: `${origin}/og.png` },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { name: 'twitter:card', content: 'summary_large_image' },
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'UTEG',
        url,
        description,
        inLanguage: language,
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'CHF' },
      },
    },
  ];
}

export default function Landing({ loaderData: { language } }: Route.ComponentProps) {
  const { t } = useTranslation(['landing', 'common', 'auth', 'ranking', 'pdf']);

  return (
    <main id="content">
      <Hero language={language} />

      <Section title={t('import.title')} text={t('import.text')}>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
          {IMPORTED.map(({ name, birthYear, club, category }) => (
            <li
              key={name}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                !category && 'bg-destructive/10',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{name}</span>
                <span className="text-sm text-muted-foreground">
                  {birthYear} · {club}
                </span>
              </span>
              <Category category={category} />
            </li>
          ))}
        </ul>
        <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common:fields.name')}</TableHead>
                <TableHead>{t('common:fields.birthYear')}</TableHead>
                <TableHead>{t('common:fields.club')}</TableHead>
                <TableHead>{t('common:fields.category')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {IMPORTED.map(({ name, birthYear, club, category }) => (
                <TableRow key={name} className={cn('h-13', !category && 'bg-destructive/10')}>
                  <TableCell className="font-semibold">{name}</TableCell>
                  <TableCell>{birthYear}</TableCell>
                  <TableCell>{club}</TableCell>
                  <TableCell>
                    <Category category={category} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <section className="display-surface bg-ink text-ink-foreground [color-scheme:dark]">
        <div className="mx-auto grid max-w-[77.5rem] gap-6 px-4 py-14 sm:px-6 lg:gap-10 lg:py-24">
          <div className="grid items-end gap-x-12 gap-y-3 lg:grid-cols-[2fr_1fr]">
            <Heading>{t('live.title')}</Heading>
            <p className="text-ink-muted">{t('live.text')}</p>
          </div>
          <div
            className="grid gap-3 md:grid-cols-2"
            // Of the text of the panels, set by the device of a real display.
            style={{ '--scale': 1 } as CSSProperties}
          >
            {PANELS.map(({ apparatus, slots }) => (
              <div key={apparatus} className="grid h-40 lg:h-56">
                <ApparatusPanel apparatus={apparatus} slots={slots} count={1} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section title={t('ranking.title')} text={t('ranking.text')} isReversed>
        <div className="border bg-card p-4 sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b-2 border-primary pb-3">
            <div>
              <p className="font-display text-2xl leading-tight">
                {t('ranking:title')} {categoryName('K5', t)} {t('pdf:sex.FEMALE')}
              </p>
              <p className="text-muted-foreground">{t('ranking.competition')}</p>
            </div>
            <p className="shrink-0 border border-dashed border-input px-2.5 py-1.5 text-sm text-muted-foreground">
              {t('ranking.logo')}
            </p>
          </div>
          <ol className="divide-y">
            {RANKING.map(({ name, club, award, total }, index) => (
              <li key={name} className="flex gap-3 py-2.5">
                <span className="figure w-5 text-lg">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{name}</span>
                  <span className="text-sm text-muted-foreground">{club}</span>
                </span>
                <span>{t(`ranking:awards.${award}`)}</span>
                <span className="figure text-lg">{total}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <section className="bg-accent">
        <div className="mx-auto max-w-[77.5rem] px-4 py-14 sm:px-6 lg:py-22">
          <Heading className="mb-4 lg:mb-9">{t('faq.title')}</Heading>
          {/* Closed on phones, where the answers would be a long way to scroll. */}
          <div className="md:hidden">
            {FAQ.map((key, index) => (
              <details
                key={key}
                open={index === 0}
                className="group border-b border-input/60 last:border-0"
              >
                <summary className="flex min-h-13 cursor-pointer items-center gap-3 py-2.5 text-lg leading-snug font-semibold">
                  <h3 className="flex-1">{t(`faq.${key}.question`)}</h3>
                  <ChevronDownIcon aria-hidden className="size-5 shrink-0 group-open:rotate-180" />
                </summary>
                <p className="pb-4 text-muted-foreground">{t(`faq.${key}.answer`)}</p>
              </details>
            ))}
          </div>
          <div className="hidden gap-x-16 gap-y-8 md:grid md:grid-cols-2">
            {FAQ.map((key) => (
              <div key={key}>
                <h3 className="text-xl leading-snug font-semibold">{t(`faq.${key}.question`)}</h3>
                <p className="mt-1.5 text-muted-foreground">{t(`faq.${key}.answer`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-[77.5rem] flex-col gap-x-14 gap-y-6 px-4 sm:px-6 lg:flex-row lg:items-center">
          <Rings className="h-56 shrink-0 self-start lg:h-72" />
          <div className="flex flex-col items-start gap-6 pb-12 lg:py-16">
            <Heading>{t('closing')}</Heading>
            <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
              <Link to={`/register?lang=${language}`}>{t('auth:registerTitle')}</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function Heading({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2
      className={cn(
        'font-display text-[clamp(2.5rem,4.6vw,4rem)] leading-none wrap-break-word',
        className,
      )}
    >
      {children}
    </h2>
  );
}

function Section({
  title,
  text,
  isReversed = false,
  children,
}: {
  title: string;
  text: string;
  isReversed?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto grid max-w-[77.5rem] items-center gap-x-20 gap-y-6 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-28">
      <div className={cn('grid gap-3', isReversed && 'lg:order-2')}>
        <Heading>{title}</Heading>
        <p className="max-w-[46ch] text-muted-foreground">{text}</p>
      </div>
      {children}
    </section>
  );
}

function Category({ category }: { category: string | null }) {
  const { t } = useTranslation('landing');
  if (category) return <span className="font-semibold">{categoryName(category, t)}</span>;
  return <span className="font-semibold text-destructive">{t('import.missing')}</span>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Of an address like /fr, or /fr.data for navigations in the app. */
function getLanguage(request: Request): Language {
  const code = new URL(request.url).pathname.slice(1, 3).toLowerCase();
  return isLanguage(code) ? code : 'de';
}

/** From "Anna Frei, TV Muri". */
function createSlot(starter: string, grade: { value: number } | null) {
  const [name, clubName] = starter.split(', ');
  const [firstname, lastname] = name.split(' ');
  return {
    entryId: name,
    firstname,
    lastname,
    clubName,
    withdrawn: false,
    precision: 2 as const,
    grade,
  };
}
