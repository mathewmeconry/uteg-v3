import type { Route } from './+types/displayLogin';
import { createAccessCookie } from '~/lib/access.server';

/** Called by AccessGate with the key of the link. */
export async function action({ request, params: { linkId } }: Route.ActionArgs) {
  const token = (await request.formData()).get('token');
  const cookie = await createAccessCookie(linkId, 'DISPLAY', token);
  if (!cookie) throw new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie } });
}
