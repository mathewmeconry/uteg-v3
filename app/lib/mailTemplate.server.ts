import mjml2html from 'mjml';
import { env } from './env.server';
import { createI18n } from './i18n';
import type { Language } from '~/locales';

type MailName = 'code' | 'reset' | 'existing' | 'invitation';
type MailValues = {
  code?: string;
  url?: string;
  competition?: string;
  inviter?: string;
  email?: string;
};

// What the values are in a template, so they never get into the markup unescaped.
const PLACEHOLDERS: Required<MailValues> = {
  code: '__code__',
  url: '__url__',
  competition: '__competition__',
  inviter: '__inviter__',
  email: '__email__',
};

export const APP_URL = env.APP_URL.replace(/\/$/, '');

/** Subject, HTML and plain text of a mail. */
export async function createMail(name: MailName, language: Language, values: MailValues) {
  const { t } = createI18n(language);
  const text = [
    t(`mails:${name}.title`, values),
    t(`mails:${name}.text`, values),
    values.url ?? values.code,
    t(`mails:${name}.note`, values),
  ].join('\n\n');

  const template = await getTemplate(name, language);
  // All at once, a value may look like a placeholder.
  const html = template.replaceAll(/__(code|url|competition|inviter|email)__/g, (_, key) =>
    escapeHtml(values[key as keyof MailValues] ?? ''),
  );
  return { subject: t(`mails:${name}.subject`, values), html, text };
}

// Rendering takes long enough to tell from the time of an answer that a mail is sent.
const templates = new Map<string, Promise<string>>();

function getTemplate(name: MailName, language: Language) {
  const key = `${name}:${language}`;
  const template = templates.get(key) ?? renderTemplate(name, language);
  templates.set(key, template);
  return template;
}

async function renderTemplate(name: MailName, language: Language) {
  const { t } = createI18n(language);
  const values: MailValues = PLACEHOLDERS;
  const action =
    name === 'code'
      ? `<mj-text css-class="text" font-size="40px" line-height="48px" font-weight="800"
          letter-spacing="6px">${PLACEHOLDERS.code}</mj-text>`
      : `<mj-button css-class="button" align="left" background-color="${LIGHT.primary}"
          color="${LIGHT.primaryForeground}" font-weight="600" border-radius="8px"
          inner-padding="14px 24px" href="${PLACEHOLDERS.url}">${t(`mails:${name}.button`)}</mj-button>`;

  const { html, errors } = await mjml2html(
    layout({
      language,
      title: t(`mails:${name}.title`, values),
      text: t(`mails:${name}.text`, values),
      note: t(`mails:${name}.note`, values),
      tagline: t('tagline'),
      action,
    }),
  );
  if (errors.length > 0) {
    throw new Error(`MJML: ${errors.map(({ formattedMessage }) => formattedMessage).join('; ')}`);
  }
  return html;
}

// The tokens of app.css, which mail clients do not understand.
const LIGHT = {
  background: '#f5f7fa',
  foreground: '#191d24',
  card: '#ffffff',
  mutedForeground: '#555a62',
  primary: '#31363d',
  primaryForeground: '#fafcff',
  border: '#d9dbde',
};
const DARK = {
  background: '#111315',
  foreground: '#eef0f4',
  card: '#1c1d20',
  mutedForeground: '#aab0b9',
  primary: '#d2d8e2',
  primaryForeground: '#12161d',
  border: '#32373f',
};
const INK = '#22272e';
const INK_FOREGROUND = '#f5f7fa';

function layout(content: {
  language: Language;
  title: string;
  text: string;
  note: string;
  tagline: string;
  action: string;
}) {
  return `
<mjml lang="${content.language}">
  <mj-head>
    <mj-title>${content.title}</mj-title>
    <mj-preview>${content.text}</mj-preview>
    <mj-raw>
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
    </mj-raw>
    <mj-attributes>
      <mj-all font-family="Archivo, 'Helvetica Neue', Arial, sans-serif" />
      <mj-text font-size="16px" line-height="24px" color="${LIGHT.foreground}" padding="0 32px 20px" />
      <mj-button font-size="16px" padding="0 32px 24px" />
    </mj-attributes>
    <mj-style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      .card { border: 1px solid ${LIGHT.border}; border-top: 0; }
      @media (prefers-color-scheme: dark) {
        .page, .page > div { background-color: ${DARK.background} !important; }
        .card { border-color: ${DARK.border} !important; }
        .body, .body > table { background-color: ${DARK.card} !important; background: ${DARK.card} !important; }
        .text div { color: ${DARK.foreground} !important; }
        .muted div { color: ${DARK.mutedForeground} !important; }
        .line p { border-top-color: ${DARK.border} !important; }
        .button td { background: ${DARK.primary} !important; }
        .button a { background: ${DARK.primary} !important; color: ${DARK.primaryForeground} !important; }
      }
    </mj-style>
  </mj-head>
  <mj-body width="560px" background-color="${LIGHT.background}" css-class="page">
    <mj-wrapper padding="32px 16px 16px">
      <mj-section padding="0" background-color="${INK}" border-radius="10px 10px 0 0">
        <mj-column>
          <mj-text color="${INK_FOREGROUND}" font-size="20px" line-height="32px" font-weight="800" padding="12px 32px">
            <img src="${APP_URL}/mail-logo.png" alt="" width="32" height="32" style="vertical-align: middle; margin-left: -6px; margin-right: 8px;" /><span style="vertical-align: middle;">UTEG</span>
          </mj-text>
        </mj-column>
      </mj-section>
      <mj-section css-class="card body" padding="32px 0 4px" background-color="${LIGHT.card}" border-radius="0 0 10px 10px">
        <mj-column>
          <mj-text css-class="text" font-size="28px" line-height="32px" font-weight="800">${content.title}</mj-text>
          <mj-text css-class="text">${content.text}</mj-text>
          ${content.action}
          <mj-divider css-class="line" border-width="1px" border-color="${LIGHT.border}" padding="4px 32px 20px" />
          <mj-text css-class="muted" font-size="13px" line-height="18px" color="${LIGHT.mutedForeground}">${content.note}</mj-text>
        </mj-column>
      </mj-section>
    </mj-wrapper>
    <mj-section padding="0 16px 32px">
      <mj-column>
        <mj-text css-class="muted" align="center" font-size="13px" line-height="18px" color="${LIGHT.mutedForeground}">UTEG · ${content.tagline}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
