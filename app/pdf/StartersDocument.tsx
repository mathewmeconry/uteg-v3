import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Sex } from '~/generated/prisma/client';
import type { ServerT } from '~/locales';
import {
  Cell,
  clamp,
  FONT,
  HeaderRow,
  MUTED,
  PageNumber,
  Row,
  Table,
  type Column,
} from './components';

export type StarterRow = {
  id: string;
  firstname: string;
  lastname: string;
  birthYear: number;
  sex: Sex;
  category: string | null;
  divisionNumber: number | null;
  apparatus: string | null;
};

export type ClubGroup = { id: string; name: string; location: string; rows: StarterRow[] };

const NAME: Column = { flex: 1 };
const BIRTH_YEAR: Column = { width: 56 };
const SEX: Column = { width: 66 };
const CATEGORY: Column = { width: 62 };
const DIVISION: Column = { width: 40 };
const APPARATUS: Column = { width: 84 };

/** The time react-pdf needs grows with the square of the rows of a Page. */
const ROWS_PER_SECTION = 150;

export function StartersDocument({
  clubs,
  competitionName,
  t,
  language,
}: {
  clubs: ClubGroup[];
  competitionName: string;
  t: ServerT;
  language: string;
}) {
  return (
    <Document
      title={`${t('pdf:starters.title')} ${competitionName}`}
      creator="UTEG"
      language={language}
    >
      {toSections(clubs).map((section, index) => (
        <Page
          key={index}
          size="A4"
          style={{
            fontFamily: FONT,
            fontSize: 9,
            paddingTop: 32,
            paddingHorizontal: 40,
            paddingBottom: 40,
          }}
        >
          <View
            fixed
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 14,
              color: MUTED,
            }}
          >
            <Text style={{ flexShrink: 0 }}>{t('pdf:starters.title')}</Text>
            <Text style={{ ...clamp(2), flexShrink: 1, textAlign: 'right' }}>
              {competitionName}
            </Text>
          </View>
          {section.length === 0 && <Text>{t('pdf:starters.empty')}</Text>}
          {section.map(({ id, name, location, count, rows }) => (
            <Table
              key={id}
              title={
                <Text style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  {name}
                  <Text style={{ fontSize: 9, fontWeight: 400, color: MUTED }}>
                    {`  ${location} · ${t('starterCount', { count })}`}
                  </Text>
                </Text>
              }
              header={
                <HeaderRow>
                  <Cell column={NAME}>{t('fields.name')}</Cell>
                  <Cell column={BIRTH_YEAR}>{t('fields.birthYear')}</Cell>
                  <Cell column={SEX}>{t('fields.sex')}</Cell>
                  <Cell column={CATEGORY}>{t('fields.category')}</Cell>
                  <Cell column={DIVISION}>{t('pdf:starters.division')}</Cell>
                  <Cell column={APPARATUS}>{t('fields.startApparatus')}</Cell>
                </HeaderRow>
              }
              rows={rows.map((row, rowIndex) => (
                <Row key={rowIndex}>
                  <Cell column={NAME}>{`${row.lastname} ${row.firstname}`}</Cell>
                  <Cell column={BIRTH_YEAR}>{row.birthYear}</Cell>
                  <Cell column={SEX}>{t(`sex.${row.sex}`)}</Cell>
                  <Cell column={CATEGORY}>{row.category}</Cell>
                  <Cell column={DIVISION}>{row.divisionNumber}</Cell>
                  <Cell column={APPARATUS}>
                    {row.apparatus && t(`apparatus.${row.apparatus as 'reck'}`)}
                  </Cell>
                </Row>
              ))}
            />
          ))}
          <PageNumber />
        </Page>
      ))}
    </Document>
  );
}

type Part = ClubGroup & { count: number };

/** Splits the list into parts that start on a new page. At least one. */
function toSections(clubs: ClubGroup[]): Part[][] {
  const sections: Part[][] = [[]];
  let size = 0;
  for (const club of clubs) {
    const count = new Set(club.rows.map(({ id }) => id)).size;
    for (let start = 0; start < club.rows.length; start += ROWS_PER_SECTION) {
      const rows = club.rows.slice(start, start + ROWS_PER_SECTION);
      if (size > 0 && size + rows.length > ROWS_PER_SECTION) {
        sections.push([]);
        size = 0;
      }
      sections.at(-1)!.push({ ...club, rows, count });
      size += rows.length;
    }
  }
  return sections;
}
