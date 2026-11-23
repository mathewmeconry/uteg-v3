import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Sex } from '~/generated/prisma/client';
import type { ServerT } from '~/locales';
import { Cell, HeaderRow, MUTED, PageNumber, Row, type Column } from './components';
import { FONT } from './pdf.server';

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
      <Page
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
          <Text style={{ flexShrink: 1, textAlign: 'right' }}>{competitionName}</Text>
        </View>
        {clubs.length === 0 && <Text>{t('pdf:starters.empty')}</Text>}
        {clubs.map(({ id, name, location, rows }) => (
          <View key={id} style={{ marginBottom: 18 }}>
            <Text minPresenceAhead={60} style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              {name}
              <Text style={{ fontSize: 9, fontWeight: 400, color: MUTED }}>
                {`  ${location} · ${t('starterCount', { count: new Set(rows.map((row) => row.id)).size })}`}
              </Text>
            </Text>
            <View>
              <HeaderRow>
                <Cell column={NAME}>{t('fields.name')}</Cell>
                <Cell column={BIRTH_YEAR}>{t('fields.birthYear')}</Cell>
                <Cell column={SEX}>{t('fields.sex')}</Cell>
                <Cell column={CATEGORY}>{t('fields.category')}</Cell>
                <Cell column={DIVISION}>{t('pdf:starters.division')}</Cell>
                <Cell column={APPARATUS}>{t('fields.startApparatus')}</Cell>
              </HeaderRow>
              {rows.map((row, index) => (
                <Row key={index}>
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
            </View>
          </View>
        ))}
        <PageNumber />
      </Page>
    </Document>
  );
}
