import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Route } from './+types/competitions';
import { SearchInput } from '~/components/admin/SearchInput';
import { StatusBadge } from '~/components/StatusBadge';
import { listAllCompetitions } from '~/lib/admin.server';
import { formatDateRange } from '~/lib/format';

export async function loader() {
  return { competitions: await listAllCompetitions() };
}

export default function AdminCompetitions({ loaderData: { competitions } }: Route.ComponentProps) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [search, setSearch] = useState('');
  const text = search.trim().toLowerCase();
  const found = competitions.filter(({ name, location, owners }) =>
    [name, location, ...owners].some((value) => value.toLowerCase().includes(text)),
  );

  return (
    <>
      <title>{`${t('competitions')} · ${t('title')} · UTEG`}</title>
      <SearchInput value={search} onChange={setSearch} placeholder={t('searchCompetitions')} />
      {found.length === 0 ? (
        <p className="text-muted-foreground">{t('common:noResults')}</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {found.map(({ id, name, location, startDate, endDate, isToday, owners, starters }) => (
            <li key={id}>
              <Link
                to={`/competitions/${id}`}
                className="flex items-center gap-4 px-4 py-3 outline-offset-[-2px] hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                    <span className="min-w-0 wrap-anywhere">{name}</span>
                    {isToday && <StatusBadge tone="live">{t('today')}</StatusBadge>}
                  </p>
                  <p className="text-sm wrap-anywhere text-muted-foreground">
                    {location}, {formatDateRange(startDate, endDate, i18n.language)}
                  </p>
                  {owners.length > 0 && (
                    <p className="text-sm wrap-anywhere text-muted-foreground">
                      {owners.join(', ')}
                    </p>
                  )}
                </div>
                {starters > 0 && (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {t('common:starterCount', { count: starters })}
                  </span>
                )}
                <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
