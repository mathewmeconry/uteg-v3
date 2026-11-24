import { RouterContextProvider } from 'react-router';
import { languageContext } from '~/context';
import { sendMail } from '~/lib/mail.server';
import { prisma } from '~/lib/prisma.server';
import { truncateTables } from '~/tests/helpers';
import { action } from './register';

beforeEach(truncateTables);

it.each([
  ['en-GB,en;q=0.9,de;q=0.8', '', 'en', 'Your UTEG code'],
  ['de-CH,de;q=0.9,en;q=0.8', '', 'de', 'Dein UTEG-Code'],
  ['en-GB,en;q=0.9,de;q=0.8', '?lang=de', 'de', 'Dein UTEG-Code'],
  ['en-GB,en;q=0.9,de;q=0.8', '?lang=xx', 'en', 'Your UTEG code'],
])('uses the language of the browser %s or the link %s', async (accepted, search, ...expected) => {
  const [language, subject] = expected;
  const email = `${language}@example.com`;
  const context = new RouterContextProvider();
  // From a cookie.
  context.set(languageContext, language === 'en' ? 'de' : 'en');
  const request = new Request(`http://localhost/register${search}`, {
    method: 'POST',
    headers: { 'Accept-Language': accepted },
    body: new URLSearchParams({
      email,
      password: 'only-for-tests',
      repeatPassword: 'only-for-tests',
    }),
  });
  await action({ request, context } as any);

  expect(await prisma.user.findFirst()).toMatchObject({ email, language });
  await vi.waitFor(() =>
    expect(sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: email, subject: expect.stringContaining(subject) }),
    ),
  );
});
