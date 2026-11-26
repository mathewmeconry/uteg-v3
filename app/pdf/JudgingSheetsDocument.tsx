import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Sex } from '~/generated/prisma/client';
import type { GradingState } from '~/lib/judging.server';
import { categoryName } from '~/lib/categoryName';
import { gradeColumnWidth, SHEET } from '~/lib/judgingSheet';
import type { ServerT } from '~/locales';
import {
  Cell,
  clamp,
  FONT,
  HeaderRow,
  MUTED,
  PageNumber,
  QrCode,
  Row,
  Table,
  type Column,
} from './components';
import { sheetCode } from '~/lib/sheetCode.server';

type Slot = GradingState['apparatus'][number]['rounds'][number]['slots'][number];

const PAGE = {
  fontFamily: FONT,
  fontSize: 9,
  paddingTop: SHEET.paddingTop,
  paddingHorizontal: SHEET.paddingX,
  paddingBottom: SHEET.paddingBottom,
};
const NUMBER: Column = { width: 24 };
const NAME: Column = { flex: 3 };
const CLUB: Column = { flex: 2 };
/** Also holds the aggregation of the final grade in small type. */
const CATEGORY: Column = { width: 46 };

/**
 * One sheet per ground, apparatus and round, filled in by hand. Each page has a QR code and a
 * square in each corner, so a photo of it can be read.
 */
export function JudgingSheetsDocument({
  grounds,
  competitionName,
  t,
  language,
}: {
  grounds: (GradingState & { ground: number })[];
  competitionName: string;
  t: ServerT;
  language: string;
}) {
  const pages = grounds.flatMap(({ ground, divisions, apparatus }) =>
    apparatus.flatMap(({ apparatus: key, rounds }) =>
      rounds.flatMap(({ round, slots }) => {
        // Progress has a row for each apparatus of a division.
        const here = divisions.filter(
          (division) => key in division.progress && round < division.rounds,
        );
        // The same columns on every page of a list.
        const attempts = Math.max(1, ...slots.map(({ inputRule }) => inputRule.attempts));
        const pageCount = Math.max(1, Math.ceil(slots.length / SHEET.rowsPerPage));
        return Array.from({ length: pageCount }, (_, page) => {
          const offset = page * SHEET.rowsPerPage;
          const rows = slots.slice(offset, offset + SHEET.rowsPerPage);
          return {
            ground,
            divisions: here,
            apparatus: key,
            round,
            attempts,
            offset,
            rows,
            code: sheetCode({
              apparatus: key,
              round,
              divisionIds: here.map(({ id }) => id),
              offset,
              entryIds: rows.map(({ entryId }) => entryId),
              attempts,
            }),
          };
        });
      }),
    ),
  );
  return (
    <Document
      title={`${t('pdf:sheets.title')} ${competitionName}`}
      creator="UTEG"
      language={language}
    >
      {pages.map(({ ground, divisions, apparatus, round, attempts, offset, rows, code }) => (
        <Page key={`${ground}-${apparatus}-${round}-${offset}`} size="A4" style={PAGE}>
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              height: SHEET.headerHeight,
              marginBottom: SHEET.headerGap,
            }}
          >
            <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text
                  style={{ ...clamp(2), flexGrow: 1, flexShrink: 1, flexBasis: 0, color: MUTED }}
                >
                  {competitionName}
                </Text>
                <Text style={{ flexShrink: 0, color: MUTED }}>
                  {t('ground', { number: ground })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 18, fontWeight: 700 }}>
                  {t(`apparatus.${apparatus as 'reck'}`)}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: 700 }}>
                  {t('round', { number: round + 1 })}
                </Text>
              </View>
              <Text style={{ ...clamp(6), marginTop: 4 }}>
                {divisions
                  .map(({ category, sex, number }) => divisionLabel({ category, sex, number }, t))
                  .join('  ·  ')}
              </Text>
            </View>
            {rows.length > 0 && <QrCode value={code} size={SHEET.qrSize} />}
          </View>
          {rows.length === 0 ? (
            <Text style={{ marginTop: 24, fontSize: 14, textAlign: 'center' }}>
              {t('pdf:sheets.pause')}
            </Text>
          ) : (
            <>
              <Sheet rows={rows} attempts={attempts} offset={offset} t={t} />
              <CornerMarks />
            </>
          )}
          <PageNumber />
        </Page>
      ))}
      {pages.length === 0 && (
        <Page size="A4" style={PAGE}>
          <Text style={{ fontSize: 14 }}>{t('pdf:sheets.noDivisions')}</Text>
        </Page>
      )}
    </Document>
  );
}

function Sheet({
  rows,
  attempts,
  offset,
  t,
}: {
  rows: Slot[];
  attempts: number;
  offset: number;
  t: ServerT;
}) {
  const numbers = attempts > 1 ? Array.from({ length: attempts }, (_, index) => index + 1) : [];
  const gradeColumn: Column = { width: gradeColumnWidth(attempts) };
  const box = {
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderLeftWidth: SHEET.border,
    borderLeftColor: MUTED,
  } as const;

  return (
    <Table
      header={
        <HeaderRow style={{ height: SHEET.tableHeaderHeight }}>
          <Cell column={NUMBER}>{t('pdf:sheets.number')}</Cell>
          <Cell column={NAME}>{t('fields.name')}</Cell>
          <Cell column={CLUB}>{t('fields.club')}</Cell>
          <Cell column={CATEGORY}>{t('pdf:sheets.category')}</Cell>
          {numbers.map((number) => (
            <Cell key={number} column={gradeColumn} align="center">
              {t('pdf:sheets.attempt', { number })}
            </Cell>
          ))}
          <Cell column={gradeColumn} align="center">
            {attempts > 1 ? t('pdf:sheets.final') : t('fields.grade')}
          </Cell>
        </HeaderRow>
      }
      rows={rows.map((slot, index) => {
        const struck = { textDecoration: slot.withdrawn ? 'line-through' : 'none' } as const;
        // Not in the grade's cell, where people would write over it.
        const hint = slot.withdrawn
          ? t('pdf:sheets.withdrawn')
          : slot.inputRule.aggregation !== 'NONE' &&
            t(`pdf:sheets.aggregation.${slot.inputRule.aggregation}`);
        return (
          <Row key={slot.entryId} style={{ height: SHEET.rowHeight }}>
            <Cell column={NUMBER} style={struck}>
              {offset + index + 1}
            </Cell>
            <Cell column={NAME} style={{ ...struck, ...clamp(2), fontSize: 10 }}>
              {`${slot.firstname} ${slot.lastname}`}
            </Cell>
            <Cell column={CLUB} style={{ ...struck, ...clamp(2) }}>
              {slot.clubName}
            </Cell>
            <Cell column={CATEGORY}>
              <Text style={struck}>{categoryName(slot.category, t)}</Text>
              {hint && <Text style={{ fontSize: 6, color: MUTED }}>{`\n${hint}`}</Text>}
            </Cell>
            {numbers.map((number) => (
              <View key={number} style={box}>
                <Cell column={gradeColumn} align="center" style={{ color: MUTED }}>
                  {!slot.withdrawn && number > slot.inputRule.attempts ? '–' : ''}
                </Cell>
              </View>
            ))}
            <View style={box}>
              <Cell column={gradeColumn} />
            </View>
          </Row>
        );
      })}
    />
  );
}

/** Where a scan finds the corners of the page. Within what printers print. */
function CornerMarks() {
  return (['top', 'bottom'] as const).flatMap((vertical) =>
    (['left', 'right'] as const).map((horizontal) => (
      <View
        key={`${vertical}-${horizontal}`}
        style={{
          position: 'absolute',
          [vertical]: SHEET.cornerInset,
          [horizontal]: SHEET.cornerInset,
          width: SHEET.cornerSize,
          height: SHEET.cornerSize,
          backgroundColor: '#000000',
        }}
      />
    )),
  );
}

function divisionLabel(
  { category, sex, number }: { category: string; sex: Sex; number: number },
  t: ServerT,
) {
  return t('pdf:division', {
    category: categoryName(category, t),
    sex: t(`pdf:sex.${sex}`),
    number,
  });
}
