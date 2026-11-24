import { LANGUAGES } from '~/locales';
import { createMail } from './mailTemplate.server';

const INVITATION = {
  url: 'https://uteg.test/register?a=1&b=2',
  competition: '<b>Cup</b> "$&" __inviter__',
  inviter: 'owner@example.com',
  email: 'new@example.com',
};

describe.each(LANGUAGES)('mails in %s', (language) => {
  it('show the code', async () => {
    const mail = await createMail('code', language, { code: '012345' });
    for (const content of Object.values(mail)) expect(content).toContain('012345');
    expect(mail.html).toContain(`lang="${language}"`);
  });

  it.each(['reset', 'existing'] as const)('link to the page: %s', async (name) => {
    const { html, text } = await createMail(name, language, { url: 'https://uteg.test/x?token=a' });
    expect(html).toContain('href="https://uteg.test/x?token=a"');
    expect(text).toContain('https://uteg.test/x?token=a');
  });

  it('escape what users entered, only in the HTML', async () => {
    const { subject, html, text } = await createMail('invitation', language, INVITATION);
    expect(subject).toContain(INVITATION.competition);
    expect(text).toContain(INVITATION.competition);
    expect(html).toContain('&lt;b&gt;Cup&lt;/b&gt; &quot;$&amp;&quot; __inviter__');
    expect(html).not.toContain('<b>Cup');
    expect(html).toContain('href="https://uteg.test/register?a=1&amp;b=2"');
    expect(html).not.toMatch(/__(url|code|email)__/);
  });
});
