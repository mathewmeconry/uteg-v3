import { Document, Page, Path, Rect, Svg, Text, View } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { ReactNode } from 'react';
import type { ServerT } from '~/locales';
import { MUTED } from './components';
import { FONT } from './pdf.server';

export type ManualLink = { id: string; ground: number; apparatus: string; url: string };

const QR_SIZE = 150;
const QUIET_ZONE = 4;

/** One page per judge link. */
export function JudgingManualDocument({
  links,
  competitionName,
  t,
  language,
}: {
  links: ManualLink[];
  competitionName: string;
  t: ServerT;
  language: string;
}) {
  return (
    <Document
      title={`${t('pdf:manual.title')} ${competitionName}`}
      creator="UTEG"
      language={language}
    >
      {links.map((link) => {
        const apparatus = t(`apparatus.${link.apparatus as 'reck'}`);
        const ground = t('ground', { number: link.ground });
        return (
          <Page
            key={link.id}
            size="A4"
            style={{ fontFamily: FONT, fontSize: 11, lineHeight: 1.35, padding: 45 }}
          >
            <Text style={{ fontSize: 9, color: MUTED }}>{competitionName}</Text>
            <Text style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}>
              {t('pdf:manual.title')}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 1.35 }}>{`${apparatus} · ${ground}`}</Text>

            <Section title={t('pdf:manual.login')}>
              <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
                <PdfQrCode value={link.url} />
                <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 8 }}>
                  <Step number={1}>{t('pdf:manual.login1')}</Step>
                  <Step number={2}>{t('pdf:manual.login2', { apparatus, ground })}</Step>
                  <Text style={{ fontSize: 9, color: MUTED }}>{t('pdf:manual.login3')}</Text>
                </View>
              </View>
            </Section>
            <Section title={t('pdf:manual.waiting')}>
              <Text>{t('pdf:manual.waiting1')}</Text>
            </Section>
            <Section title={t('pdf:manual.grading')}>
              <Step number={1}>{t('pdf:manual.grading1', { next: t('actions.next') })}</Step>
              <Step number={2}>{t('pdf:manual.grading2', { back: t('actions.back') })}</Step>
              <Step number={3}>{t('pdf:manual.grading3')}</Step>
              <Step number={4}>{t('pdf:manual.grading4')}</Step>
            </Section>
            <Section title={t('pdf:manual.pause')}>
              <Text>{t('pdf:manual.pause1')}</Text>
            </Section>
            <Section title={t('pdf:manual.overview')}>
              <Text>{t('pdf:manual.overview1')}</Text>
            </Section>
            <Section title={t('pdf:manual.changes')}>
              <Text>{t('pdf:manual.changes1')}</Text>
              <Text>{t('pdf:manual.changes2')}</Text>
            </Section>
          </Page>
        );
      })}
    </Document>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View wrap={false} style={{ marginTop: 14, gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{title}</Text>
      {children}
    </View>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ width: 18, flexShrink: 0 }}>{`${number}.`}</Text>
      <Text style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>{children}</Text>
    </View>
  );
}

function PdfQrCode({ value }: { value: string }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = modules.size + 2 * QUIET_ZONE;
  let path = '';
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) {
        path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }
  return (
    <Svg viewBox={`0 0 ${size} ${size}`} style={{ width: QR_SIZE, height: QR_SIZE }}>
      <Rect x={0} y={0} width={size} height={size} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
