import { useTranslation } from 'react-i18next';
import type { SplitClub } from './proposal';

type Apparatus = keyof (typeof import('~/locales/de/common'))['default']['apparatus'];

/** The clubs of a division that are in several lineups. Names the division of lineups in others. */
export function SplitClubs({ clubs, number }: { clubs: readonly SplitClub[]; number: number }) {
  const { t } = useTranslation(['divisions', 'common']);
  if (clubs.length === 0) return null;

  function lineupText(lineup: SplitClub['lineups'][number]) {
    const text = `${t(`common:apparatus.${lineup.apparatus as Apparatus}`)} ${lineup.length}`;
    return lineup.number === number ? text : `${t('number', { number: lineup.number })}: ${text}`;
  }

  return (
    <span className="block text-sm text-muted-foreground">
      {t('proposal.split', {
        clubs: clubs
          .map(({ clubName, lineups }) => `${clubName} (${lineups.map(lineupText).join(', ')})`)
          .join('; '),
      })}
    </span>
  );
}
