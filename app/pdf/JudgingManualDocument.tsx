import { Document, Link, Page, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { ServerT } from '~/locales';
import { clamp, FONT, MUTED, QrCode } from './components';

export type ManualLink = { id: string; ground: number; apparatus: string; url: string };

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
        const confirm = t('judging:review.confirm');
        return (
          <Page
            key={link.id}
            size="A4"
            style={{ fontFamily: FONT, fontSize: 11, lineHeight: 1.35, padding: 45 }}
          >
            <Text style={{ ...clamp(2), fontSize: 9, color: MUTED }}>{competitionName}</Text>
            <Text style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}>
              {t('pdf:manual.title')}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 1.35 }}>{`${apparatus} · ${ground}`}</Text>

            <Section title={t('pdf:manual.login')}>
              <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
                {/* Also a link, for those who get the manual by mail. */}
                <Link src={link.url}>
                  <QrCode value={link.url} size={150} />
                </Link>
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
              <Step number={4}>
                {t('pdf:manual.grading4', { review: t('judging:toReview'), confirm })}
              </Step>
            </Section>
            <Section title={t('judging:pause.title')}>
              <Text>{t('pdf:manual.pause1', { confirm })}</Text>
            </Section>
            <Section title={t('judging:list.all')}>
              <Text>{t('pdf:manual.overview1')}</Text>
            </Section>
            <Section title={t('pdf:manual.changes')}>
              <Text>{t('pdf:manual.changes1')}</Text>
              <Text>{t('pdf:manual.changes2', { continue: t('judging:save.continue') })}</Text>
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
