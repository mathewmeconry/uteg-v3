import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createFullProposal,
  type FullProposalData,
  type FullProposalOptions,
} from './fullProposal';
import { useDivisionName } from './useDivisionName';

type Apparatus = keyof (typeof import('~/locales/de/common'))['default']['apparatus'];

type Proposal = ReturnType<typeof createFullProposal>;

/** Null while the sizes are not valid. */
export function useFullProposal(
  data: FullProposalData,
  {
    size,
    maxSize,
    keepTogether,
    mergeSmall,
  }: Omit<FullProposalOptions, 'size' | 'maxSize'> & {
    size: number | null;
    maxSize: number | null;
  },
) {
  const { entries, sexes, due, numbers } = data;
  const key = JSON.stringify([entries, sexes, due, numbers]);
  return useMemo(
    () =>
      size !== null && maxSize !== null
        ? createFullProposal(data, { size, maxSize, keepTogether, mergeSmall })
        : null,
    // Other live updates do not change who is distributed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, size, maxSize, keepTogether, mergeSmall],
  );
}

export function FullProposalPreview({
  proposal,
  grounds,
}: {
  proposal: Proposal;
  grounds: number;
}) {
  const { t } = useTranslation(['divisions', 'common']);
  const divisionName = useDivisionName();

  function lineupText({ apparatus, length }: Proposal[number]['lineups'][number]) {
    return `${t(`common:apparatusShort.${apparatus as Apparatus}`)} ${length}`;
  }

  return Array.from({ length: grounds }, (_, index) => index + 1).map((ground) => {
    const divisions = proposal.filter(({ group }) => group.ground === ground);
    return (
      <section key={ground} aria-label={t('common:ground', { number: ground })}>
        <h2 className="mb-2 flex items-baseline justify-between gap-3 text-lg font-semibold">
          {t('common:ground', { number: ground })}
          <span className="text-sm font-normal text-muted-foreground">
            {t('count', { count: divisions.length })}
          </span>
        </h2>
        <ol className="divide-y rounded-xl border bg-card">
          {divisions.map(({ group: { category, sex }, number, lineups, clashes, together }) => {
            const name = divisionName({ category, sex, number });
            return (
              <li key={name} className="px-4 py-2.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{name}</span>
                  <span className="figure">{lineups.map(lineupText).join(' · ')}</span>
                </span>
                {together.length > 0 && (
                  <span className="block text-sm">
                    {t('proposal.together', { divisions: together.map(divisionName).join('; ') })}
                  </span>
                )}
                {clashes.length > 0 && (
                  <span className="block text-sm text-muted-foreground">
                    {t('proposal.clashes', { clubs: clashes.join(', ') })}
                  </span>
                )}
              </li>
            );
          })}
          {divisions.length === 0 && (
            <li className="px-4 py-2.5 text-muted-foreground">{t('order.emptyGround')}</li>
          )}
        </ol>
      </section>
    );
  });
}
