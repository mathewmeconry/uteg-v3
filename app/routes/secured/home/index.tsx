import { PlusIcon, TrophyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Route } from './+types/index';
import { EmptyState } from '~/components/EmptyState';
import { PageHeader } from '~/components/PageHeader';
import { Button } from '~/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { getUser } from '~/lib/auth/auth.server';
import { listCompetitions } from '~/lib/competitions.server';
import { formatDateRange } from '~/lib/format';

export async function loader({ context }: Route.LoaderArgs) {
  const competitions = await listCompetitions(getUser(context).id);
  return {
    competitions: competitions.map(({ id, name, location, startDate, endDate, logoId }) => ({
      id,
      name,
      location,
      startDate,
      endDate,
      logoId,
    })),
  };
}

export default function Home({ loaderData: { competitions } }: Route.ComponentProps) {
  const { t, i18n } = useTranslation('competition');
  const newButton = (
    <Button asChild size="lg">
      <Link to="/competitions/new">
        <PlusIcon aria-hidden />
        {t('new')}
      </Link>
    </Button>
  );

  return (
    <>
      <title>{`${t('listTitle')} · UTEG`}</title>
      <PageHeader title={t('listTitle')} actions={competitions.length > 0 && newButton} />
      {competitions.length === 0 ? (
        <EmptyState
          icon={TrophyIcon}
          title={t('emptyTitle')}
          text={t('emptyText')}
          action={newButton}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map(({ id, name, location, startDate, endDate, logoId }) => (
            <li key={id}>
              <Link to={`/competitions/${id}`} className="group block h-full rounded-xl">
                <Card className="h-full transition-colors group-hover:border-primary">
                  <CardHeader>
                    {logoId && (
                      <img
                        src={`/api/assets/${logoId}`}
                        alt=""
                        className="mb-2 h-16 w-full object-contain object-left"
                      />
                    )}
                    <CardTitle className="text-lg">{name}</CardTitle>
                    <CardDescription>
                      {location}
                      <br />
                      {formatDateRange(startDate, endDate, i18n.language)}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
