import type { Route } from './+types/judgeLogin';
import { createAccessCookie } from '~/lib/access.server';

/** Called by AccessGate with the key of the QR code. */
export async function action({ request, params: { linkId } }: Route.ActionArgs) {
  const token = (await request.formData()).get('token');
  const cookie = await createAccessCookie(linkId, 'JUDGE', token);
  if (!cookie) throw new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie } });
}
