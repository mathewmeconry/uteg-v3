import { UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, redirect } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/divisionProposal';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { GroundField } from '~/components/divisions/DivisionDialogs';
import { createFullProposal } from '~/components/divisions/fullProposal';
import {
  DEFAULT_MAX_SIZE,
  DEFAULT_SIZE,
  describeDivisions,
  equalCounts,
  groupEntries,
  MAX_DIVISIONS,
  parseNumber,
  SIZE,
  toFormData,
  toLineups,
  usedApparatus,
  type ProposedDivision,
} from '~/components/divisions/proposal';
import { ProposalBoard } from '~/components/divisions/ProposalBoard';
import { useClubMoves, useMovedProposals } from '~/components/divisions/useClubMoves';
import { EmptyState } from '~/components/EmptyState';
import { FormActions } from '~/components/FormActions';
import { FormField } from '~/components/FormField';
import { PageHeader } from '~/components/PageHeader';
import { RadioChips } from '~/components/RadioChips';
import { SubmitButton } from '~/components/SubmitButton';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Switch } from '~/components/ui/switch';
import { competitionContext, contestContext } from '~/context';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { useSexes } from '~/hooks/useSexes';
import { categoryName } from '~/lib/categoryName';
import {
  createDivisionsWithLineups,
  listDivisions,
  listWithoutDivision,
} from '~/lib/divisions.server';
import { countDivisions, proposeLineups } from '~/lib/domain/divisionProposal';
import { actionError } from '~/lib/domainErrors.server';
import { parseForm } from '~/lib/forms.server';
import { safeClientAction } from '~/lib/safeClientAction';
import type { Sex } from '~/modules/types';
import { requirePermission } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';
import { enqueueToast } from '~/middlewares/toast.server';

type Apparatus = keyof (typeof import('~/locales/de/common'))['default']['apparatus'];

export async function loader({ context }: Route.LoaderArgs) {
  requirePermission(context, 'edit');
  const { id: competitionId, grounds } = context.get(competitionContext);
  const { id, module } = context.get(contestContext);
  const [entries, divisions] = await Promise.all([
    listWithoutDivision(id),
    listDivisions(competitionId),
  ]);
  const numbers: Record<string, number> = {};
  for (const { contestId, category, sex, number } of divisions) {
    const key = `${category} ${sex}`;
    if (contestId === id) numbers[key] = Math.max(numbers[key] ?? 0, number);
  }
  return {
    entries: entries.map(({ id, category, starter: { sex, club } }) => ({
      id,
      category,
      sex,
      clubId: club.id,
      clubName: club.name,
    })),
    due: Array.from(
      { length: grounds },
      (_, index) =>
        divisions.filter(({ ground, state }) => ground === index + 1 && state !== 'ENDED').length,
    ),
    numbers,
    categories: { FEMALE: module.categories('FEMALE'), MALE: module.categories('MALE') },
    apparatus: {
      FEMALE: module.apparatus('FEMALE') as readonly Apparatus[],
      MALE: module.apparatus('MALE') as readonly Apparatus[],
    },
  };
}

/** As they were shown. */
const divisionsSchema = z
  .array(
    z.object({
      category: z.string(),
      sex: z.enum(['FEMALE', 'MALE']),
      ground: z.number().int(),
      lineups: z
        .record(z.string(), z.array(z.string().min(1)))
        .refine((lineups) => Object.values(lineups).flat().length > 0),
    }),
  )
  .min(1)
  .max(200);

const schema = z.object({
  divisions: z
    .string()
    .transform((text, ctx): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        ctx.addIssue({ code: 'custom' });
        return z.NEVER;
      }
    })
    .pipe(divisionsSchema),
});

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requirePermission(context, 'edit');
  const contest = context.get(contestContext);
  const t = getT(context);
  const { data: values } = parseForm(await request.formData(), schema);
  if (!values) return data({ error: t('common:errors.invalid') }, 400);

  try {
    await createDivisionsWithLineups(id, contest.id, values.divisions);
  } catch (error) {
    return actionError(error, t);
  }
  const count = values.divisions.length;
  enqueueToast(context, { type: 'success', message: t('divisions:proposal.done', { count }) });
  return redirect(`/competitions/${id}/contests/${contest.id}/divisions`);
}

export const clientAction = safeClientAction;

export default function DivisionProposal({ loaderData, params }: Route.ComponentProps) {
  const { entries } = loaderData;
  const { t } = useTranslation(['divisions', 'common']);
  const { competition } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [maxSize, setMaxSize] = useState(DEFAULT_MAX_SIZE);
  const moved = useMovedProposals();
  const sexes = useSexes().filter((sex) => entries.some((entry) => entry.sex === sex));
  const divisionsUrl = `/competitions/${competition.id}/contests/${params.contestId}/divisions`;

  const props = {
    ...loaderData,
    sexes,
    moved,
    size: { text: size, onChange: setSize },
    maxSize: { text: maxSize, onChange: setMaxSize },
  };

  return (
    <>
      <title>{`${t('proposal.title')} · UTEG`}</title>
      <PageHeader
        title={t('proposal.title')}
        description={`${t('proposal.text')} ${t('proposal.moveHint')}`}
        breadcrumbs={[{ to: divisionsUrl, label: t('title') }]}
        status={<ConnectionBadge status={status} />}
      />
      {sexes.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t('proposal.empty')} text={t('proposal.emptyText')} />
      ) : (
        // Settings on the left, the preview next to all of them, see ProposalForm.
        <div className="grid items-start gap-x-8 gap-y-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
          <RadioChips
            legend={t('proposal.scope')}
            name="scope"
            value={scope}
            options={[
              { value: 'one', label: t('proposal.one') },
              { value: 'all', label: t('proposal.all') },
            ]}
            onChange={setScope}
          />
          {scope === 'one' ? <CategoryProposal {...props} /> : <AllCategories {...props} />}
        </div>
      )}
    </>
  );
}

type SizeInput = { text: string; onChange: (text: string) => void };

type ProposalProps = Route.ComponentProps['loaderData'] & {
  sexes: readonly Sex[];
  moved: ReturnType<typeof useMovedProposals>;
  size: SizeInput;
  maxSize: SizeInput;
};

function AllCategories({ moved, size, maxSize, ...data }: ProposalProps) {
  const { t } = useTranslation(['divisions', 'common']);
  const { competition } = useCompetition();
  const sizes = useSizes(size, maxSize);
  const [keepTogether, setKeepTogether] = useState(true);
  const [mergeSmall, setMergeSmall] = useState(false);
  const { entries, sexes, due, numbers } = data;
  const dataKey = JSON.stringify([entries, sexes, due, numbers]);
  const proposal = useMemo(
    () =>
      sizes.size !== null && sizes.maxSize !== null
        ? createFullProposal(data, {
            size: sizes.size,
            maxSize: sizes.maxSize,
            keepTogether,
            mergeSmall,
          })
        : null,
    // Other live updates do not change who is distributed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataKey, sizes.size, sizes.maxSize, keepTogether, mergeSmall],
  );

  return (
    <ProposalForm
      proposal={proposal}
      settings={JSON.stringify(['all', sizes.size, sizes.maxSize, keepTogether, mergeSmall])}
      moved={moved}
      grounds={Array.from({ length: competition.grounds }, (_, index) => index + 1)}
      maxSize={sizes.maxSize}
      problem={t('proposal.invalid')}
      fields={
        <>
          <SizeFields size={size} maxSize={maxSize} errors={sizes.errors} />
          <div>
            <label className="flex min-h-10 items-center gap-3 text-sm pointer-coarse:min-h-11">
              <Switch checked={mergeSmall} onCheckedChange={setMergeSmall} />
              {t('proposal.mergeSmall')}
            </label>
            <p className="text-sm text-muted-foreground">{t('proposal.mergeHint')}</p>
          </div>
          {competition.grounds > 1 && (
            <>
              <label className="flex min-h-10 items-center gap-3 text-sm pointer-coarse:min-h-11">
                <Switch checked={keepTogether} onCheckedChange={setKeepTogether} />
                {t('proposal.keepTogether')}
              </label>
              <p className="text-sm text-muted-foreground">{t('proposal.allHint')}</p>
            </>
          )}
        </>
      }
    />
  );
}

function CategoryProposal({
  entries,
  categories,
  apparatus: allApparatus,
  numbers,
  sexes,
  moved,
  size,
  maxSize,
}: ProposalProps) {
  const { t } = useTranslation(['divisions', 'common']);
  const { competition } = useCompetition();
  const [chosenSex, setSex] = useState(sexes[0]);
  const [chosenCategory, setCategory] = useState('');
  const [ground, setGround] = useState(1);
  // Null: as many as needed.
  const [chosenCount, setCount] = useState<string | null>(null);
  const [chosenApparatus, setApparatus] = useState<readonly string[] | null>(null);

  // The last starters of what is chosen may have got a division.
  const sex = sexes.includes(chosenSex) ? chosenSex : sexes[0];
  const options = groupEntries(entries, categories, sex);
  const { category, members } =
    options.find(({ category }) => category === chosenCategory) ?? options[0];

  const sizes = useSizes(size, maxSize);
  const usableSize = sizes.size ?? Number(DEFAULT_SIZE);
  const apparatus = chosenApparatus
    ? allApparatus[sex].filter((key) => chosenApparatus.includes(key))
    : usedApparatus(allApparatus[sex], members.length, usableSize);
  const lineupCount = apparatus.length;
  const count =
    chosenCount ?? String(countDivisions(members.length, Math.max(1, lineupCount), usableSize));
  const countNumber = parseNumber(count, { min: 1, max: MAX_DIVISIONS });

  const apparatusKey = apparatus.join();
  const memberKey = members.map(({ id, clubId }) => `${id} ${clubId}`).join();
  const isValid = sizes.size !== null && sizes.maxSize !== null && countNumber !== null;
  const firstNumber = (numbers[`${category} ${sex}`] ?? 0) + 1;
  const proposal = useMemo(() => {
    if (!isValid || sizes.maxSize === null || countNumber === null) return null;
    const divisions = proposeLineups(members, {
      lineupCounts: equalCounts(countNumber, lineupCount),
      maxSize: sizes.maxSize,
    });
    return (
      divisions?.map((lineups, index): ProposedDivision => ({
        category,
        sex,
        number: firstNumber + index,
        ground: 1,
        slot: index,
        lineups: toLineups(lineups, apparatus),
      })) ?? null
    );
    // Other live updates do not change who is distributed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey, isValid, countNumber, apparatusKey, sizes.maxSize, firstNumber]);

  function reset() {
    setCount(null);
    setApparatus(null);
  }

  return (
    <ProposalForm
      proposal={proposal}
      settings={JSON.stringify([
        category,
        sex,
        sizes.size,
        sizes.maxSize,
        chosenCount,
        chosenApparatus,
      ])}
      moved={moved}
      ground={ground}
      grounds={[ground]}
      maxSize={sizes.maxSize}
      problem={
        lineupCount === 0
          ? t('proposal.noApparatus')
          : isValid
            ? t('proposal.doesNotFit', { count: members.length })
            : t('proposal.invalid')
      }
      fields={
        <>
          {sexes.length > 1 && (
            <RadioChips
              legend={t('common:fields.sex')}
              name="sex"
              value={sex}
              options={sexes.map((value) => ({ value, label: t(`common:sex.${value}`) }))}
              onChange={(value) => {
                setSex(value);
                reset();
              }}
            />
          )}
          <RadioChips
            legend={t('common:fields.category')}
            name="category"
            value={category}
            options={options.map(({ category, members }) => ({
              value: category,
              label: `${categoryName(category, t)} (${members.length})`,
            }))}
            onChange={(value) => {
              setCategory(value);
              reset();
            }}
          />
          <GroundField grounds={competition.grounds} defaultValue={ground} onChange={setGround} />
          <SizeFields
            size={{
              ...size,
              onChange: (text) => {
                size.onChange(text);
                setCount(null);
              },
            }}
            maxSize={maxSize}
            errors={sizes.errors}
          />
          <FormField
            label={t('proposal.count')}
            error={
              countNumber === null ? t('proposal.range', { min: 1, max: MAX_DIVISIONS }) : undefined
            }
            hint={t('proposal.countHint')}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_DIVISIONS}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t('proposal.apparatus')}</legend>
            {allApparatus[sex].map((key) => (
              <label
                key={key}
                className="flex min-h-10 items-center gap-3 text-sm pointer-coarse:min-h-11"
              >
                <Checkbox
                  checked={apparatus.includes(key)}
                  onCheckedChange={(checked) =>
                    setApparatus(
                      checked === true
                        ? [...apparatus, key]
                        : apparatus.filter((other) => other !== key),
                    )
                  }
                />
                {t(`common:apparatus.${key}`)}
              </label>
            ))}
          </fieldset>
        </>
      }
    />
  );
}

/** The settings, the preview and the button that saves what is shown. */
function ProposalForm({
  proposal,
  settings,
  moved,
  ground,
  grounds,
  maxSize,
  problem,
  fields,
}: {
  proposal: ProposedDivision[] | null;
  /** What was chosen for the proposal. */
  settings: string;
  moved: ReturnType<typeof useMovedProposals>;
  /** Instead of those of the proposal. */
  ground?: number;
  grounds: number[];
  maxSize: number | null;
  /** Why there is no proposal. */
  problem: string;
  fields: React.ReactNode;
}) {
  const { t } = useTranslation('divisions');
  const { Form, pending } = useActionFetcher();
  const moves = useClubMoves(proposal, settings, moved);
  const divisions =
    moves.divisions?.map((division) => (ground ? { ...division, ground } : division)) ?? null;
  const created = toFormData(divisions ?? []);

  return (
    <Form method="post" className="contents">
      <input type="hidden" name="divisions" value={JSON.stringify(created)} />
      <div className="grid gap-5">{fields}</div>
      <div className="grid min-w-0 gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {moves.isOutdated && !pending && <Problem text={t('proposal.outdated')} />}
        {divisions ? (
          <ProposalBoard
            divisions={describeDivisions(divisions)}
            grounds={grounds}
            maxSize={maxSize ?? Infinity}
            onMove={moves.move}
          />
        ) : (
          <Problem text={problem} />
        )}
        <FormActions>
          <SubmitButton pending={pending} disabled={!divisions}>
            {t('proposal.submit', { count: created.length || 1 })}
          </SubmitButton>
          {moves.isMoved && (
            <Button type="button" variant="outline" disabled={pending} onClick={moves.reset}>
              {t('proposal.resetMoves')}
            </Button>
          )}
        </FormActions>
      </div>
    </Form>
  );
}

function SizeFields({
  size,
  maxSize,
  errors,
}: {
  size: SizeInput;
  maxSize: SizeInput;
  errors: ReturnType<typeof useSizes>['errors'];
}) {
  const { t } = useTranslation('divisions');
  return (
    <div className="grid grid-cols-2 items-start gap-4">
      <FormField
        label={t('proposal.size')}
        error={errors.size}
        type="number"
        inputMode="numeric"
        {...SIZE}
        value={size.text}
        onChange={(event) => size.onChange(event.target.value)}
      />
      <FormField
        label={t('proposal.maxSize')}
        error={errors.maxSize}
        type="number"
        inputMode="numeric"
        {...SIZE}
        value={maxSize.text}
        onChange={(event) => maxSize.onChange(event.target.value)}
      />
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <Alert variant="warning">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The sizes are null when they cannot be used. */
function useSizes(sizeInput: SizeInput, maxInput: SizeInput) {
  const { t } = useTranslation('divisions');
  const size = parseNumber(sizeInput.text, SIZE);
  const max = parseNumber(maxInput.text, SIZE);
  const isBelow = size !== null && max !== null && max < size;
  return {
    size,
    maxSize: isBelow ? null : max,
    errors: {
      size: size === null ? t('proposal.range', SIZE) : undefined,
      maxSize:
        max === null ? t('proposal.range', SIZE) : isBelow ? t('proposal.maxBelowSize') : undefined,
    },
  };
}
