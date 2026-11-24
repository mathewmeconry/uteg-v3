import { Outlet } from 'react-router';
import type { Route } from './+types/layout';
import { BottomNav, ContestSelect, SetupNav, TopBar } from '~/components/CompetitionNav';
import { competitionContext } from '~/context';
import { getUser } from '~/lib/auth/auth.server';
import { listCompetitions } from '~/lib/competitions.server';
import { hasRole } from '~/lib/roles';
import { competitionMiddleware } from '~/middlewares/competition.server';

export const middleware: Route.MiddlewareFunction[] = [competitionMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const { contests, role, ...competition } = context.get(competitionContext);
  const competitions = await listCompetitions(getUser(context).id);
  return {
    competition: {
      id: competition.id,
      name: competition.name,
      location: competition.location,
      startDate: competition.startDate,
      endDate: competition.endDate,
      grounds: competition.grounds,
      sexes: competition.sexes,
      logoId: competition.logoId,
    },
    // To switch to another one.
    competitions: competitions.map(({ id, name, startDate, endDate }) => ({
      id,
      name,
      startDate,
      endDate,
    })),
    contests: contests.map(({ id, name, module }) => ({ id, name, module })),
    role,
    canEdit: hasRole(role, 'EDITOR'),
    isOwner: role === 'OWNER',
    isCheckIn: role === 'CHECK_IN',
  };
}

export default function CompetitionLayout() {
  return (
    <>
      <TopBar />
      <div className="mx-auto flex w-full max-w-[90rem] gap-10 px-4 pt-5 pb-[calc(3rem+var(--bottom-nav))] md:px-8 md:pt-8">
        <SetupNav />
        <main id="content" className="min-w-0 flex-1">
          <ContestSelect />
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </>
  );
}
