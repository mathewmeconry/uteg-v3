import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { expect, it } from 'vitest';
import { rankEntries } from '~/lib/domain/ranking';
import { createI18n } from '~/lib/i18n';
import { RankingList } from './RankingList';

const apparatus = ['reck', 'boden'];
const options = {
  tieBreak: [],
  precision: 2,
  averaged: [],
  averageDecimals: 3,
  honourPercent: 100,
  honourRounding: 'round',
} as const;

function entry(firstname: string, reck: number, boden?: number) {
  return {
    id: firstname,
    starterId: firstname,
    firstname,
    lastname: 'Frei',
    birthYear: 2012,
    clubName: 'TV Chur',
    clubLocation: 'Chur',
    grades: { reck, ...(boden !== undefined && { boden }) } as Record<string, number>,
  };
}

it('shows ranks, grades, the best ones and awards', () => {
  const ranking = rankEntries(
    [entry('Anna', 9000, 9500), entry('Bea', 9250), entry('Cleo', 8000), entry('Dana', 7000)],
    apparatus,
    options,
  );
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RankingList {...ranking} apparatus={apparatus} options={options} />
    </I18nextProvider>,
  );
  const [, anna, bea, , dana] = screen.getAllByRole('row');
  expect(anna).toHaveTextContent(
    /1.*Anna Frei.*TV Chur.*9\.00.*9\.50 \(Beste Note\).*18\.50.*Gold/,
  );
  expect(bea).toHaveTextContent(/2.*Bea Frei.*9\.25 \(Beste Note\).*–.*9\.25.*Silber/);
  expect(within(dana).getByText('Auszeichnung')).toBeInTheDocument();
});

it.each([
  [3, /9\.00.*9\.075.*18\.075/],
  [2, /9\.00.*9\.08.*18\.08/],
] as const)('shows averages with %i decimals', (averageDecimals, text) => {
  const scoring = { ...options, averaged: ['boden'], averageDecimals };
  const ranking = rankEntries([entry('Anna', 9000, 9075)], apparatus, scoring);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RankingList {...ranking} apparatus={apparatus} options={scoring} />
    </I18nextProvider>,
  );
  expect(screen.getAllByRole('row')[1]).toHaveTextContent(text);
});
