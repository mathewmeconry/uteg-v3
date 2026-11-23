import { data } from 'react-router';
import type { Route } from './+types/language';
import { isLanguage } from '~/locales';
import { languageCookie } from '~/middlewares/i18n.server';

/** Remembers the language of judges and displays, which have no profile. */
export async function action({ request }: Route.ActionArgs) {
  const language = (await request.formData()).get('language');
  if (!isLanguage(language)) throw data(null, 400);
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': await languageCookie.serialize(language) },
  });
}
