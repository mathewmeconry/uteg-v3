import { Circle, Document, Page, Svg, Text, View } from '@react-pdf/renderer';
import type { Sex } from '~/generated/prisma/client';
import { formatGrade } from '~/lib/domain/grade';
import type { Award } from '~/lib/domain/ranking';
import { fillPlaceholders, type RankingTemplateOptions } from '~/lib/domain/rankingTemplate';
import type { RankingResult } from '~/lib/ranking.server';
import type { ServerT } from '~/locales';
import {
  Cell,
  HeaderRow,
  LogoImage,
  MUTED,
  PageNumber,
  Row,
  type Column,
  type Logo,
} from './components';
import { FONT } from './pdf.server';

type RankedEntry = Pick<
  RankingResult['entries'][number],
  | 'id'
  | 'firstname'
  | 'lastname'
  | 'birthYear'
  | 'clubName'
  | 'clubLocation'
  | 'rank'
  | 'award'
  | 'values'
  | 'total'
>;

export type RankingGroup = {
  category: string;
  sex: Sex;
  provisional: boolean;
  apparatus: readonly string[];
  best: RankingResult['best'];
  entries: RankedEntry[];
};

export type RankingDocumentProps = {
  groups: RankingGroup[];
  options: RankingTemplateOptions;
  competition: { name: string; location: string; date: string };
  logo: Logo | null;
  t: ServerT;
  language: string;
};

const MARGIN = 40;
const PAGE_WIDTH = { portrait: 595, landscape: 842 };
const MEDAL_COLORS = { GOLD: '#d4a017', SILVER: '#9ca3af', BRONZE: '#b06a2c' };

export function RankingDocument(props: RankingDocumentProps) {
  const { groups, options, competition, t, language } = props;
  const pages = options.newPagePerCategory ? groups.map((group) => [group]) : [groups];

  return (
    <Document
      title={`${t('ranking:title')} ${competition.name}`}
      creator="UTEG"
      language={language}
    >
      {pages.map((pageGroups) => (
        <RankingPage key={groupKey(pageGroups[0])} {...props} groups={pageGroups} />
      ))}
    </Document>
  );
}

function RankingPage({ groups, options, competition, logo, t }: RankingDocumentProps) {
  const footerLines = options.footer
    .split('\n')
    .reduce(
      (lines, line) =>
        lines + Math.ceil(line.length / (options.orientation === 'portrait' ? 95 : 150)),
      0,
    );
  const fill = (pattern: string, filled = groups) =>
    fillPlaceholders(pattern, {
      category: [...new Set(filled.map(({ category }) => category))].join(', '),
      sex: [...new Set(filled.map(({ sex }) => t(`pdf:sex.${sex}`)))].join(', '),
      competition: competition.name,
      location: competition.location,
      date: competition.date,
    });
  const heading = options.groupHeading || (groups.length > 1 ? '{category} {sex}' : '');

  return (
    <Page
      size="A4"
      orientation={options.orientation}
      style={{
        fontFamily: FONT,
        fontSize: 9,
        paddingTop: 32,
        paddingHorizontal: MARGIN,
        paddingBottom: 40 + Math.max(0, footerLines - 1) * 10,
      }}
    >
      <PageHead {...{ options, logo }}>
        <Text style={{ fontSize: 16, fontWeight: 700 }}>{fill(options.title)}</Text>
        {options.subtitle !== '' && (
          <Text style={{ fontSize: 12, marginTop: 2 }}>{fill(options.subtitle)}</Text>
        )}
        {options.showDate && <Text style={{ marginTop: 3, color: MUTED }}>{competition.date}</Text>}
      </PageHead>
      {groups.map((group) => (
        <View key={groupKey(group)} style={{ marginBottom: 18 }}>
          {heading !== '' && (
            <Text minPresenceAhead={70} style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              {fill(heading, [group])}
            </Text>
          )}
          {group.provisional && (
            <Text minPresenceAhead={60} style={{ fontWeight: 700, marginBottom: 4 }}>
              {t('pdf:ranking.provisional')}
            </Text>
          )}
          <RankingTable {...{ group, options, t }} />
        </View>
      ))}
      {options.signatureLabels.length > 0 && <Signatures labels={options.signatureLabels} />}
      <Text
        fixed
        style={{
          position: 'absolute',
          bottom: 18,
          left: MARGIN,
          right: MARGIN + 40,
          fontSize: 8,
          color: MUTED,
        }}
      >
        {fill(options.footer)}
      </Text>
      {options.showPageNumbers && <PageNumber />}
    </Page>
  );
}

function PageHead({
  options: { showLogo, logoPosition, accentColor },
  logo,
  children,
}: Pick<RankingDocumentProps, 'options' | 'logo'> & { children: React.ReactNode }) {
  const image = showLogo && logo && <LogoImage logo={logo} />;
  const center = Boolean(image) && logoPosition === 'center';
  return (
    <View
      fixed
      style={{
        flexDirection: center ? 'column' : 'row',
        alignItems: center ? 'center' : 'flex-start',
        gap: 12,
        paddingBottom: 8,
        marginBottom: 12,
        borderBottomWidth: 2,
        borderBottomColor: accentColor,
      }}
    >
      {logoPosition !== 'right' && image}
      <View style={center ? { textAlign: 'center' } : { flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
        {children}
      </View>
      {logoPosition === 'right' && image}
    </View>
  );
}

function RankingTable({
  group: { apparatus, best, entries },
  options,
  t,
}: Pick<RankingDocumentProps, 'options' | 't'> & { group: RankingGroup }) {
  const { columns, nameFormat, decimals } = options;
  const rows = options.onlyAwarded ? entries.filter(({ award }) => award !== null) : entries;
  const oneName = nameFormat !== 'separate' && columns.firstname && columns.lastname;
  const gradeWidth = decimals === 3 ? 3.6 : 3;

  type Definition = {
    key: string;
    label: string;
    /** In em, the minimum when flexible. */
    width: number;
    flexible?: boolean;
    align?: 'right' | 'center';
    bold?: (entry: RankedEntry) => boolean;
    value: (entry: RankedEntry) => React.ReactNode;
  };
  const definitions: (Definition | false)[] = [
    { key: 'rank', label: t('pdf:ranking.rank'), width: 2.7, value: ({ rank }) => rank },
    oneName && {
      key: 'name',
      label: t('fields.name'),
      width: 10,
      flexible: true,
      value: ({ firstname, lastname }) =>
        nameFormat === 'lastFirst' ? `${lastname} ${firstname}` : `${firstname} ${lastname}`,
    },
    !oneName &&
      columns.firstname && {
        key: 'firstname',
        label: t('fields.firstname'),
        width: 6.5,
        flexible: true,
        value: ({ firstname }) => firstname,
      },
    !oneName &&
      columns.lastname && {
        key: 'lastname',
        label: t('fields.lastname'),
        width: 6.5,
        flexible: true,
        value: ({ lastname }) => lastname,
      },
    columns.birthYear && {
      key: 'birthYear',
      label: t('pdf:ranking.birthYear'),
      width: 3,
      value: ({ birthYear }) => birthYear,
    },
    columns.club && {
      key: 'club',
      label: t('fields.club'),
      width: 8,
      flexible: true,
      value: ({ clubName }) => clubName,
    },
    columns.location && {
      key: 'location',
      label: t('fields.location'),
      width: 6.5,
      flexible: true,
      value: ({ clubLocation }) => clubLocation,
    },
    ...(columns.apparatus ? apparatus : []).map<Definition>((key) => ({
      key,
      label: t(`apparatusShort.${key as 'reck'}`),
      width: gradeWidth,
      align: 'right',
      bold: ({ values }) =>
        options.highlightBest && values[key] !== null && values[key] === best[key],
      value: ({ values }) => formatValue(values[key], decimals),
    })),
    columns.total && {
      key: 'total',
      label: t('pdf:ranking.total'),
      width: gradeWidth + 0.4,
      align: 'right',
      bold: () => true,
      value: ({ total }) => formatValue(total, decimals),
    },
    columns.award && {
      key: 'award',
      label: '',
      width: 1.6,
      align: 'center',
      value: ({ award }) => <AwardMark award={award} style={options.medalStyle} size={fontSize} />,
    },
  ];
  const shown = definitions.filter((definition) => definition !== false);

  // Text that doesn't fit next to each other would overlap, so the font shrinks if needed.
  const available = PAGE_WIDTH[options.orientation] - 2 * MARGIN;
  const padding = shown.length * 6;
  const needed = shown.reduce((sum, { width }) => sum + width, 0);
  const fontSize = Math.min(options.fontSize, (available - padding) / needed);
  const rowStyle = { fontSize, minHeight: options.rowHeight };
  const toColumn = ({ width, flexible }: Definition): Column =>
    flexible ? { flex: width } : { width: width * fontSize + 6 };

  return (
    <View>
      <HeaderRow
        style={{
          ...rowStyle,
          borderBottomColor: options.accentColor,
          backgroundColor: options.accentColor,
          color: getTextColor(options.accentColor),
        }}
      >
        {shown.map((definition) => (
          <Cell key={definition.key} column={toColumn(definition)} align={definition.align}>
            {definition.label}
          </Cell>
        ))}
      </HeaderRow>
      {rows.map((entry) => (
        <Row key={entry.id} style={rowStyle}>
          {shown.map((definition) => (
            <Cell
              key={definition.key}
              column={toColumn(definition)}
              align={definition.align}
              style={{ fontWeight: definition.bold?.(entry) ? 700 : 400 }}
            >
              {definition.value(entry)}
            </Cell>
          ))}
        </Row>
      ))}
      {rows.length === 0 && (
        <Text style={{ marginTop: 8, color: MUTED }}>{t('pdf:ranking.empty')}</Text>
      )}
    </View>
  );
}

function AwardMark({
  award,
  style,
  size,
}: {
  award: Award | null;
  style: RankingTemplateOptions['medalStyle'];
  size: number;
}) {
  if (award === null) return null;
  if (award === 'HONOUR') return <Text>*</Text>;
  switch (style) {
    case 'none':
      return null;
    case 'letters':
      return <Text style={{ fontWeight: 700 }}>{award[0]}</Text>;
    case 'icons':
      return (
        <Svg viewBox="0 0 10 10" style={{ width: size, height: size }}>
          <Circle cx="5" cy="5" r="4.5" fill={MEDAL_COLORS[award]} />
          <Circle cx="5" cy="5" r="3.2" fill="none" stroke="#ffffff" strokeWidth={0.7} />
        </Svg>
      );
  }
}

function Signatures({ labels }: { labels: string[] }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', gap: 24, marginTop: 40 }}>
      {labels.map((label, index) => (
        <View
          key={index}
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            borderTopWidth: 0.75,
            borderTopColor: MUTED,
            paddingTop: 3,
          }}
        >
          <Text style={{ fontSize: 8, color: MUTED }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupKey({ sex, category }: RankingGroup) {
  return `${sex}:${category}`;
}

function formatValue(value: number | null, decimals: 2 | 3) {
  return value === null ? '–' : formatGrade(value, decimals);
}

/** Black or white, whichever is readable on the colour. */
function getTextColor(background: string) {
  const [red, green, blue] = [1, 3, 5].map((index) =>
    parseInt(background.slice(index, index + 2), 16),
  );
  return 0.299 * red + 0.587 * green + 0.114 * blue > 150 ? '#000000' : '#ffffff';
}
