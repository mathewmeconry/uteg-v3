import { CheckIcon, TriangleAlertIcon, TrophyIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/ranking';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { HonourForm } from '~/components/ranking/HonourForm';
import { RankingExport } from '~/components/ranking/RankingExport';
import { RankingList } from '~/components/ranking/RankingList';
import { Toolbar } from '~/components/Toolbar';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { competitionContext, contestContext } from '~/context';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { useSexes } from '~/hooks/useSexes';
import { patchContestConfig } from '~/lib/contests.server';
import { findBrokenCovers } from '~/lib/covers.server';
import { categoryName } from '~/lib/categoryName';
import { getHonourQuota } from '~/lib/domain/ranking';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { parseForm, readForm } from '~/lib/forms.server';
import { formatDateTime } from '~/lib/format';
import { getRanking, listCategoryStates, listRankingGroups } from '~/lib/ranking.server';
import { listRankingTemplates } from '~/lib/rankingTemplates.server';
import { cn } from '~/lib/utils';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';
import { egtModule, type EgtConfig } from '~/modules/egt/module';
import { SEXES, type Sex } from '~/modules/types';

export async function loader({ request, context }: Route.LoaderArgs) {
  const competition = context.get(competitionContext);
  const { id: contestId, module } = context.get(contestContext);
  const params = new URL(request.url).searchParams;
  const provisional = params.get('provisional') === '1';

  const started = await listRankingGroups(competition.id, contestId);
  const groups = started.filter(({ hasEnded }) => hasEnded || provisional);
  // Without a choice the first ranking that shows something.
  const sex =
    competition.sexes.find((item) => item === params.get('sex')) ??
    (groups[0] ?? started[0])?.sex ??
    competition.sexes[0];
  const categories = module.categories(sex);
  const category =
    categories.find((item) => item === params.get('category')) ??
    [...groups, ...started].find((group) => group.sex === sex)?.category ??
    categories[0];

  const [states, brokenCovers, ranking, templates] = await Promise.all([
    listCategoryStates(competition.id, contestId),
    findBrokenCovers(competition.id),
    getRanking(competition.id, contestId, { category, sex, provisional }),
    listRankingTemplates(competition.id),
  ]);
  return {
    contestId,
    sex,
    category,
    categories,
    provisional,
    groups,
    states,
    ranking,
    quota: getHonourQuota(ranking.entries.length, ranking.options),
    templates: templates.map(({ id, name, isDefault, assignments }) => ({
      id,
      name,
      isDefault,
      assignments,
      isCoverBroken: brokenCovers.has(id),
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const competition = requireRole(context, 'EDITOR');
  const contest = context.get(contestContext);
  const t = getT(context);
  const invalid = t('ranking:honourInvalid');
  const { data: values, errors } = parseForm(
    await readForm(request),
    z.object({
      sex: z.enum(SEXES),
      category: z.string(),
      percent: z
        .string()
        .trim()
        .regex(/^\d+([.,]\d+)?$/, invalid)
        .transform((text) => Number(text.replace(',', '.')))
        .pipe(z.number().max(100, invalid)),
    }),
  );
  if (errors) return data({ errors }, 400);
  const { sex, category, percent } = values;
  if (!contest.module.categories(sex).includes(category)) throw data(null, 404);
  // Only this module has the setting.
  if (contest.module.key !== egtModule.key) throw data(null, 404);
  try {
    await patchContestConfig<EgtConfig>(competition.id, contest.id, (config) => ({
      ...config,
      honourPercent: {
        ...config.honourPercent,
        [sex]: { ...config.honourPercent[sex], [category]: percent },
      },
    }));
  } catch (error) {
    return data({ errors: { percent: domainErrorMessage(error, t) } }, 400);
  }
  enqueueToast(context, { type: 'success', message: t('ranking:honourSaved') });
  return { errors: undefined };
}

function ChoiceLink({
  params,
  selected,
  isEmpty = false,
  children,
}: {
  params: Record<string, string>;
  selected: boolean;
  /** There is nothing to see yet. */
  isEmpty?: boolean;
  children: ReactNode;
}) {
  const [current] = useSearchParams();
  const next = new URLSearchParams(current);
  for (const [name, value] of Object.entries(params)) next.set(name, value);
  return (
    <Link
      to={`?${next}`}
      preventScrollReset
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-[3px] pointer-coarse:h-11 pointer-coarse:min-w-11',
        isEmpty && 'font-normal text-muted-foreground',
        selected &&
          'bg-ink text-ink-foreground hover:bg-ink dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary',
      )}
    >
      {children}
    </Link>
  );
}

function ChoiceNav({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('flex gap-1 rounded-lg border bg-card p-1', className)}>
      {children}
    </nav>
  );
}

export default function Ranking({ loaderData }: Route.ComponentProps) {
  const { contestId, sex, category, categories, provisional, groups, states } = loaderData;
  const { ranking, quota, templates } = loaderData;
  const { t, i18n } = useTranslation(['ranking', 'common']);
  const { competition, canEdit } = useCompetition();
  const sexes = useSexes();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const [searchParams, setSearchParams] = useSearchParams();
  const provisionalId = useId();
  const count = ranking.entries.length;
  const hint = t('honourHint', { count, quota });
  const { honourPercent } = ranking.options;

  function toggleProvisional(checked: boolean) {
    const next = new URLSearchParams(searchParams);
    // The choice stays, also when it was the default.
    next.set('sex', sex);
    next.set('category', category);
    if (checked) next.set('provisional', '1');
    else next.delete('provisional');
    setSearchParams(next, { preventScrollReset: true });
  }

  return (
    <div className="lg:flex lg:gap-8">
      <CategoryList states={states} sex={sex} category={category} />
      <div className="flex min-w-0 flex-1 flex-col">
        <title>{`${t('title')} ${categoryName(category, t)} · UTEG`}</title>
        <PageHeader
          title={`${t('title')} ${categoryName(category, t)} ${t(`common:sex.${sex}`)}`}
          description={
            ranking.lastUpdated &&
            t('lastUpdated', { date: formatDateTime(ranking.lastUpdated, i18n.language) })
          }
          status={<ConnectionBadge status={status} />}
          actions={
            <RankingExport
              competitionId={competition.id}
              contestId={contestId}
              groups={groups}
              finished={states.filter(({ state }) => state === 'ENDED')}
              current={{ sex, category }}
              provisional={provisional}
              templates={templates}
            />
          }
        />

        {/* Where there is no room for the list. */}
        <Toolbar className="mb-2 gap-x-3 lg:hidden">
          {sexes.length > 1 && (
            <ChoiceNav label={t('common:fields.sex')} className="max-sm:w-full max-sm:*:flex-1">
              {sexes.map((item) => (
                <ChoiceLink key={item} params={{ sex: item, category }} selected={item === sex}>
                  {t(`common:sex.${item}`)}
                </ChoiceLink>
              ))}
            </ChoiceNav>
          )}
          <ChoiceNav
            label={t('common:fields.category')}
            className="max-sm:grid max-sm:w-full max-sm:grid-cols-4"
          >
            {categories.map((item) => (
              <ChoiceLink
                key={item}
                params={{ sex, category: item }}
                selected={item === category}
                isEmpty={!groups.some((group) => group.sex === sex && group.category === item)}
              >
                {categoryName(item, t)}
              </ChoiceLink>
            ))}
          </ChoiceNav>
        </Toolbar>

        {/* On phones the results come first. */}
        <Toolbar className="max-sm:order-last max-sm:mt-6 max-sm:mb-0 max-sm:border-t max-sm:pt-4">
          <Label htmlFor={provisionalId} className="min-h-11 leading-normal font-normal">
            <Switch id={provisionalId} checked={provisional} onCheckedChange={toggleProvisional} />
            {t('provisional')}
          </Label>
          {canEdit ? (
            <HonourForm
              key={`${sex}-${category}-${honourPercent}`}
              sex={sex}
              category={category}
              percent={honourPercent}
              hint={hint}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('honourPercent')}: {honourPercent} · {hint}
            </p>
          )}
        </Toolbar>

        {ranking.hasRunning && (
          <Alert variant="warning" className="mb-4">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>{t('runningTitle')}</AlertTitle>
            <AlertDescription>
              {t(provisional ? 'provisionalText' : 'runningText')}
            </AlertDescription>
          </Alert>
        )}

        {ranking.missingGrades > 0 && (
          <Alert variant="warning" className="mb-4">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>{t('missingGrades', { count: ranking.missingGrades })}</AlertTitle>
          </Alert>
        )}

        {count === 0 ? (
          <EmptyState icon={TrophyIcon} title={t('emptyTitle')} text={t('emptyText')} />
        ) : (
          <RankingList {...ranking} />
        )}
      </div>
    </div>
  );
}

/** The categories of the competition and how far they are. */
function CategoryList({
  states,
  sex: shownSex,
  category: shownCategory,
}: {
  states: Route.ComponentProps['loaderData']['states'];
  sex: Sex;
  category: string;
}) {
  const { t } = useTranslation(['ranking', 'common']);
  const [params] = useSearchParams();
  const sexes = useSexes();

  function search(sex: Sex, category: string) {
    const next = new URLSearchParams(params);
    next.set('sex', sex);
    next.set('category', category);
    return `?${next}`;
  }

  return (
    <nav
      aria-label={t('common:fields.category')}
      className="sticky top-22 hidden max-h-[calc(100dvh-7rem)] w-52 shrink-0 gap-5 self-start overflow-y-auto lg:grid"
    >
      {sexes.map((sex) => {
        const items = states.filter((item) => item.sex === sex);
        return (
          items.length > 0 && (
            <div key={sex}>
              <h2 className="mb-1 px-3 text-xs font-semibold text-muted-foreground">
                {t(`common:sex.${sex}`)}
              </h2>
              <ul className="grid gap-0.5">
                {items.map(({ category, state }) => {
                  const isShown = sex === shownSex && category === shownCategory;
                  return (
                    <li key={category}>
                      <Link
                        to={search(sex, category)}
                        preventScrollReset
                        aria-current={isShown ? 'page' : undefined}
                        className={cn(
                          'flex min-h-10 items-center justify-between gap-3 rounded-md px-3 hover:bg-accent pointer-coarse:min-h-11',
                          isShown &&
                            'bg-ink text-ink-foreground hover:bg-ink dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary',
                        )}
                      >
                        <span
                          className={cn(
                            state ? 'font-semibold' : !isShown && 'text-muted-foreground',
                          )}
                        >
                          {categoryName(category, t)}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs',
                            !isShown && 'text-muted-foreground',
                          )}
                        >
                          {state === 'ENDED' && <CheckIcon aria-hidden className="size-3.5" />}
                          {state === 'RUNNING' && (
                            <span aria-hidden className="size-2 rounded-full bg-brand" />
                          )}
                          {state && t(`states.${state}`)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        );
      })}
    </nav>
  );
}
