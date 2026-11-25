import { CircleCheckIcon } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, useFetcher, useSearchParams } from 'react-router';
import { z } from 'zod';
import type { Route } from './+types/startersImport';
import { FormActions } from '~/components/FormActions';
import { FormField } from '~/components/FormField';
import { PageHeader } from '~/components/PageHeader';
import { StepBar } from '~/components/StepBar';
import { SubmitButton } from '~/components/SubmitButton';
import { ClubCombobox, type ClubOption } from '~/components/starters/ClubCombobox';
import { ClubConflictDialog } from '~/components/starters/ClubConflictDialog';
import { MAX_IMPORT_ROWS } from '~/components/starters/importFile';
import { ImportFiles, type ImportFile } from '~/components/starters/ImportFiles';
import { ImportReview } from '~/components/starters/ImportReview';
import {
  invalidFields,
  isDivisionUnknown,
  reviewReducer,
  toImportRow,
} from '~/components/starters/importReview';
import { keepPage, useActionError } from '~/components/starters/keepPage';
import { NativeSelect } from '~/components/starters/NativeSelect';
import { fullName } from '~/components/starters/starterRow';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { useCompetition } from '~/hooks/useCompetition';
import { listClubs } from '~/lib/clubs.server';
import { getContestOptions } from '~/lib/contestOptions.server';
import { domainErrorMessage } from '~/lib/domainErrors.server';
import { withoutNul } from '~/lib/domain/starter';
import { findClubConflicts, importStarters, type ImportRow } from '~/lib/starters.server';
import { cn } from '~/lib/utils';
import { requireRole } from '~/middlewares/competition.server';
import { getT } from '~/middlewares/i18n.server';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { id, contests } = requireRole(context, 'EDITOR');
  const contestId = new URL(request.url).searchParams.get('contest') ?? contests[0]?.id;
  if (!contests.some((contest) => contest.id === contestId)) throw data(null, 404);
  const [contest, clubs] = await Promise.all([getContestOptions(id, contestId), listClubs()]);
  return { contest, clubs };
}

// Only limits sizes. importStarters validates each row and reports the invalid ones.
const id = withoutNul(z.string());
const text = withoutNul(z.string().max(500)).nullish();
const importSchema = z.object({
  contestId: id,
  clubId: id,
  /** The answer to the conflicts. They are checked before, so the first request has none. */
  changeClubOf: z.array(id).max(MAX_IMPORT_ROWS).optional(),
  rows: z
    .array(
      z.object({
        stvId: text,
        firstname: text,
        lastname: text,
        birthYear: z.number().nullish(),
        sex: z.enum(['FEMALE', 'MALE']).nullish(),
        category: text,
        divisionNumber: z.number().int().min(1).max(9999).nullish(),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

export async function action({ request, context }: Route.ActionArgs) {
  const { id } = requireRole(context, 'EDITOR');
  const t = getT(context);
  const body: unknown = await request.json().catch(() => null);
  const { data: values } = importSchema.safeParse(body);
  if (!values) return data({ error: t('starters:import.failed') }, 400);

  const rows = values.rows as ImportRow[];
  try {
    if (!values.changeClubOf) {
      const conflicts = await findClubConflicts(id, { clubId: values.clubId, rows });
      if (conflicts.length > 0) return { conflicts };
    }
    const { failures, ...counts } = await importStarters(id, { ...values, rows });
    return {
      ...counts,
      failures: failures.map(({ index, code }) => ({
        index,
        message:
          code === 'STV_ID_CONFLICT' ? t('starters:stvIdConflict') : t(`domainErrors.${code}`),
      })),
    };
  } catch (error) {
    return data({ error: domainErrorMessage(error, t) }, 400);
  }
}

export function clientAction({ serverAction }: Route.ClientActionArgs) {
  return keepPage(() => serverAction());
}

export default function StartersImport({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation('starters');
  const { competition } = useCompetition();
  const [run, setRun] = useState(0);

  return (
    <>
      <title>{`${t('importTitle')} · UTEG`}</title>
      <PageHeader
        title={t('importTitle')}
        breadcrumbs={[{ to: `/competitions/${competition.id}/starters`, label: t('title') }]}
      />
      <Wizard key={run} {...loaderData} onRestart={() => setRun(run + 1)} />
    </>
  );
}

function Wizard({
  contest,
  clubs,
  onRestart,
}: Route.ComponentProps['loaderData'] & { onRestart: () => void }) {
  const { t } = useTranslation(['starters', 'common']);
  const { competition, contests } = useCompetition();
  const [, setSearchParams] = useSearchParams();
  /** Checks the clubs, and imports when nobody is affected. */
  const checker = useFetcher<typeof clientAction>();
  /** Imports with the answer about the clubs. */
  const importer = useFetcher<typeof clientAction>();
  /** Responses that were handled. Fetchers keep them until the next one arrives. */
  const [handled, setHandled] = useState<unknown[]>([]);

  const [club, setClub] = useState<ClubOption | null>(null);
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [rows, dispatch] = useReducer(reviewReducer, []);
  const [loadedFiles, setLoadedFiles] = useState<ImportFile[]>();
  const submitRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const isPending = checker.state !== 'idle' || importer.state !== 'idle';
  const responseOf = ({ state, data: response }: typeof checker) =>
    state === 'idle' && !handled.includes(response) ? response : undefined;
  const checked = responseOf(checker);
  const imported = responseOf(importer);
  const response = imported ?? checked;
  const result = response && 'failures' in response ? response : undefined;
  const conflicts = !result && checked && 'conflicts' in checked ? checked.conflicts : undefined;
  const error = useActionError(response);
  const step = result ? 'result' : isReviewing ? 'review' : 'files';

  const found = files.reduce((sum, { starters }) => sum + starters.length, 0);
  const { issues, warnings } = useMemo(
    () => ({
      issues: rows.filter((row) => invalidFields(row, contest).length > 0).length,
      warnings: rows.filter((row) => isDivisionUnknown(row, contest)).length,
    }),
    [rows, contest],
  );

  function review() {
    // Going back and forth must not discard corrections.
    if (loadedFiles !== files) {
      dispatch({ type: 'load', starters: files.flatMap(({ starters }) => starters) });
      setLoadedFiles(files);
    }
    setIsReviewing(true);
  }

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  function submit(changeClubOf?: string[]) {
    if (!club) return;
    // The question stays open while its answer is sent.
    setHandled(changeClubOf ? [importer.data] : [importer.data, checker.data]);
    void (changeClubOf ? importer : checker).submit(
      {
        contestId: contest.id,
        clubId: club.id,
        rows: rows.map(toImportRow),
        ...(changeClubOf && { changeClubOf }),
      },
      { method: 'post', encType: 'application/json' },
    );
  }

  /** From the question about the clubs, or from the result. */
  function backToReview() {
    setHandled([importer.data, checker.data]);
  }

  return (
    <>
      <div className="max-w-3xl">
        <StepBar
          current={step}
          steps={[
            { key: 'files', label: t('import.stepFiles') },
            { key: 'review', label: t('import.stepReview') },
            { key: 'result', label: t('import.stepResult') },
          ]}
        />
      </div>

      {step === 'files' && (
        <div className="grid max-w-3xl grid-cols-1 gap-6">
          {contests.length > 1 && (
            <FormField label={t('contest')}>
              {(props) => (
                <NativeSelect
                  {...props}
                  value={contest.id}
                  onChange={(event) => setSearchParams({ contest: event.target.value })}
                >
                  {contests.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}
          <FormField label={t('common:fields.club')} hint={t('import.clubHint')}>
            {(props) => (
              <ClubCombobox
                competitionId={competition.id}
                clubs={clubs}
                value={club}
                onChange={setClub}
                controlProps={props}
              />
            )}
          </FormField>
          <ImportFiles
            files={files}
            onAdd={(added) => setFiles((previous) => [...previous, ...added])}
            onRemove={(id) => setFiles((previous) => previous.filter((file) => file.id !== id))}
          />
          {found > MAX_IMPORT_ROWS && (
            <Alert variant="destructive">
              <AlertDescription>
                {t('import.tooManyRows', { count: found, max: MAX_IMPORT_ROWS })}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-between gap-2 border-t pt-4">
            <Button variant="ghost" asChild>
              <Link to={`/competitions/${competition.id}/starters`}>
                {t('common:actions.cancel')}
              </Link>
            </Button>
            <Button disabled={!club || found === 0 || found > MAX_IMPORT_ROWS} onClick={review}>
              {t('import.toReview')}
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="grid gap-4">
          <p>
            {t('common:fields.club')}: <strong>{club && `${club.name}, ${club.location}`}</strong>
          </p>
          <ImportReview rows={rows} options={contest} dispatch={dispatch} />
          <FormActions>
            <Button variant="ghost" onClick={() => setIsReviewing(false)}>
              {t('common:actions.back')}
            </Button>
            <div
              role="status"
              className="order-first basis-full text-sm empty:hidden lg:order-none lg:flex-1"
            >
              {error && !conflicts && <p className="text-destructive">{error}</p>}
              {issues > 0 && (
                <p className="text-destructive">{t('import.issues', { count: issues })}</p>
              )}
              {warnings > 0 && <p>{t('import.warnings', { count: warnings })}</p>}
            </div>
            <SubmitButton
              ref={submitRef}
              type="button"
              className="ml-auto"
              pending={isPending}
              disabled={issues > 0 || rows.length === 0}
              onClick={() => submit()}
            >
              {t('import.submit', { count: rows.length })}
            </SubmitButton>
          </FormActions>
          {conflicts && club && (
            <ClubConflictDialog
              conflicts={conflicts}
              club={club}
              error={error}
              isPending={isPending}
              onImport={submit}
              onBack={backToReview}
              focusAfterwards={() => (submitRef.current ?? resultRef.current)?.focus()}
            />
          )}
        </div>
      )}

      {result && (
        <div className="grid max-w-3xl gap-6">
          <div className="grid gap-4">
            <h2
              ref={resultRef}
              tabIndex={-1}
              className="flex items-center gap-2 font-display text-xl outline-none"
            >
              <CircleCheckIcon aria-hidden className="size-6 text-success" />
              {t('import.resultTitle')}
            </h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
              <Count label={t('import.created')} value={result.created} />
              <Count label={t('import.restored')} value={result.restored} />
              <Count label={t('import.existing')} value={result.existing} />
              <Count label={t('import.clubsChanged')} value={result.clubsChanged} />
              <Count label={t('import.clubsKept')} value={result.clubsKept} />
              <Count label={t('import.failures')} value={result.failures.length} />
            </dl>
          </div>
          {result.failures.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{t('import.failuresTitle')}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {result.failures.map(({ index, message }) => (
                    <li key={index}>
                      {fullName(rows[index])}: {message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/competitions/${competition.id}/starters`}>{t('import.toStarters')}</Link>
            </Button>
            {result.failures.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  dispatch({
                    type: 'keep',
                    keys: result.failures.map(({ index }) => rows[index].key),
                  });
                  backToReview();
                }}
              >
                {t('import.fixFailures')}
              </Button>
            )}
            <Button variant="outline" onClick={onRestart}>
              {t('import.again')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-row-reverse items-baseline justify-end gap-2.5 bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('figure text-2xl', value === 0 && 'text-muted-foreground')}>{value}</dd>
    </div>
  );
}
