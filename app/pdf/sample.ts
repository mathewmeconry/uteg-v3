import { rankEntries } from '~/lib/domain/ranking';
import type { RankingGroup } from './RankingDocument';

const APPARATUS = ['reck', 'boden', 'schaukelringe', 'sprung'];
const SCORING = { precision: 2, averaged: [], averageDecimals: 3 } as const;

const PEOPLE = [
  ['Anna', 'Müller', 'TV Altstetten', 'Zürich'],
  ['Zoé', 'Ammann', 'Geräteriege Buchs', 'Buchs'],
  ['Maria-Alexandra', 'von Siebenthal-Oberholzer', 'Turnverein Schönenwerd-Niedergösgen', 'Olten'],
  ['Lea', 'Brunner', 'STV Dübendorf', 'Dübendorf'],
  ['Nina', 'Caduff', 'TV Chur', 'Chur'],
  ['Elin', 'Dubach', 'Getu Frauenfeld', 'Frauenfeld'],
  ['Sara', 'Egli', 'TV Gossau', 'Gossau'],
  ['Mia', 'Frei', 'STV Hinwil', 'Hinwil'],
  ['Julia', 'Gerber', 'TV Altstetten', 'Zürich'],
  ['Noemi', 'Huber', 'TV Chur', 'Chur'],
] as const;

/** Two invented rankings, for previews. */
export function createSampleGroups(): RankingGroup[] {
  return ['K5', 'K6'].map((category, group) => {
    const entries = PEOPLE.map(([firstname, lastname, clubName, clubLocation], index) => ({
      id: String(index),
      firstname,
      lastname,
      birthYear: 2012 + ((index + group) % 3),
      clubName,
      clubLocation,
      grades: Object.fromEntries(
        APPARATUS.map((apparatus, position) => [
          apparatus,
          9800 - ((index * 3 + position * 2 + group * 5) % 11) * 100 - index * 25,
        ]),
      ),
    }));
    return {
      category,
      sex: 'FEMALE',
      status: null,
      missingGrades: 0,
      scoring: SCORING,
      apparatus: APPARATUS,
      ...rankEntries(entries, APPARATUS, {
        ...SCORING,
        tieBreak: APPARATUS,
        honourPercent: 50,
        honourRounding: 'round',
      }),
    };
  });
}
