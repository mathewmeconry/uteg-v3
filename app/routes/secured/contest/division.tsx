import { FileTextIcon, PlayIcon, SquareIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, NavLink, Outlet } from 'react-router';
import type { Route } from './+types/division';
import { ConnectionBadge } from '~/components/ConnectionBadge';
import { StartDialog, StopDialog } from '~/components/divisions/DivisionDialogs';
import { inRunningOrder } from '~/components/divisions/divisionList';
import { useDivisionName } from '~/components/divisions/useDivisionName';
import { DivisionStateBadge } from '~/components/DivisionStateBadge';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { competitionContext, contestContext } from '~/context';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { useCompetition } from '~/hooks/useCompetition';
import { useLiveUpdates } from '~/hooks/useLiveUpdates';
import { listDivisions } from '~/lib/divisions.server';
import { cn } from '~/lib/utils';

export async function loader({ context, params: { divisionId } }: Route.LoaderArgs) {
  const { id } = context.get(competitionContext);
  const contest = context.get(contestContext);
  const divisions = await listDivisions(id);
  const division = divisions.find((item) => item.id === divisionId);
  if (division?.contestId !== contest.id) throw data(null, 404);
  return {
    division,
    planned: divisions.filter(
      ({ state, contestId }) => state === 'PENDING' && contestId === contest.id,
    ),
    // Of all contests, the tablets show them together.
    running: divisions.filter(({ state }) => state === 'RUNNING'),
  };
}

/** Title and actions of a division, above its grades and its lineups. */
export default function DivisionLayout({ loaderData }: Route.ComponentProps) {
  const { division, planned, running } = loaderData;
  const { t } = useTranslation(['divisions', 'common']);
  const { competition, canEdit } = useCompetition();
  const status = useLiveUpdates(`/api/events/${competition.id}`);
  const name = useDivisionName()(division);
  const [dialog, setDialog] = useState<'start' | 'stop' | null>(null);
  // What was sent, live updates come before the answer.
  const [sent, setSent] = useState(division);
  const { Form, pending } = useActionFetcher(() => setDialog(null));
  const opener = useRef<HTMLElement | null>(null);

  const divisionsUrl = `/competitions/${competition.id}/contests/${division.contestId}/divisions`;
  const sheetsUrl = `/api/competitions/${competition.id}/pdf/judging-sheets?division=${division.id}`;
  const dialogProps = {
    divisions: [pending ? sent : division],
    action: divisionsUrl,
    Form,
    pending,
    onSubmit: () => setSent(division),
    onClose: () => setDialog(null),
    onCloseAutoFocus(event: Event) {
      event.preventDefault();
      const target = opener.current;
      // Safari does not focus buttons that are clicked. Afterwards it is another button.
      if (target?.isConnected && target !== document.body) target.focus();
      else document.querySelector<HTMLElement>('#content h1')?.focus();
    },
  };

  function openDialog(next: 'start' | 'stop') {
    opener.current = document.activeElement as HTMLElement | null;
    setDialog(next);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ to: divisionsUrl, label: t('title') }]}
        title={name}
        status={
          <>
            <DivisionStateBadge state={division.state} />
            {division.state === 'RUNNING' && (
              <span className="text-sm tabular-nums">
                {t('roundOf', { round: division.round + 1, rounds: division.rounds })}
              </span>
            )}
            <ConnectionBadge status={status} />
          </>
        }
        description={[
          t('common:ground', { number: division.ground }),
          t('common:starterCount', { count: division.starterCount }),
        ].join(', ')}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={sheetsUrl} target="_blank" rel="noreferrer">
                <FileTextIcon aria-hidden />
                {t('sheets.title')}
              </a>
            </Button>
            {canEdit && division.state === 'RUNNING' && (
              <Button key="stop" variant="outline" onClick={() => openDialog('stop')}>
                <SquareIcon aria-hidden />
                {t('common:actions.stop')}
              </Button>
            )}
            {canEdit && division.state === 'PENDING' && (
              <Button key="start" onClick={() => openDialog('start')}>
                <PlayIcon aria-hidden />
                {t('common:actions.start')}
              </Button>
            )}
          </>
        }
      />
      <nav aria-label={name} className="mb-5 flex gap-6 border-b">
        <Tab to="grading">{t('tabs.grades')}</Tab>
        <Tab to="lineups">{t('tabs.lineups')}</Tab>
      </nav>
      {/* What was typed for one division does not belong to another. */}
      <Outlet key={division.id} />

      {dialog === 'start' && (
        <StartDialog planned={inRunningOrder(planned)} running={running} {...dialogProps} />
      )}
      {dialog === 'stop' && <StopDialog {...dialogProps} />}
    </>
  );
}

function Tab({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          '-mb-px flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold',
          isActive
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}
