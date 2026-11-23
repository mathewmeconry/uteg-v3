import { RouterContextProvider } from 'react-router';
import { createDisplay, getOrCreateJudgeLinks, resetToken } from '~/lib/access.server';
import { publish } from '~/lib/events.server';
import { createCompetition, truncateTables } from '~/tests/helpers';
import { prisma } from '~/lib/prisma.server';
import { loader as assetLoader } from './asset';
import { loader as displayEvents } from './displayEvents';
import { action as displayLogin } from './displayLogin';
import { loader as judgeEvents } from './judgeEvents';
import { action as judgeLogin } from './judgeLogin';

beforeEach(truncateTables);

const status = (action: Promise<unknown>) =>
  action.then(
    (response) => (response as Response).status,
    (error) => (error as Response).status,
  );

describe.each([
  ['JUDGE', judgeLogin, judgeEvents],
  ['DISPLAY', displayLogin, displayEvents],
] as const)('%s', (kind, login, events) => {
  async function setup() {
    const { id } = await createCompetition();
    const [judge] = await getOrCreateJudgeLinks(id);
    const display = await createDisplay(id, 1);
    const [link, other] = kind === 'JUDGE' ? [judge, display] : [display, judge];
    const params = { linkId: link.id };
    const post = (token: string) =>
      login({
        request: new Request('http://localhost', {
          method: 'POST',
          body: new URLSearchParams({ token }),
        }),
        params,
      } as any);
    const request = async () => {
      const cookie = (await post(link.token)).headers.get('Set-Cookie')!.split(';')[0];
      return new Request('http://localhost', { headers: { Cookie: cookie } });
    };
    return { id, link, other, params, post, request };
  }

  it('rejects wrong keys', async () => {
    const { post, other } = await setup();
    expect(await status(post('wrong'))).toBe(403);
    expect(await status(post(other.token))).toBe(403);
  });

  it.each([
    ['text/plain', 'token=a'],
    ['application/json', '{}'],
    ['multipart/form-data', 'token=a'],
    [undefined, new Uint8Array([1])],
    [undefined, undefined],
  ])('rejects a body of the type %s', async (type, body) => {
    const { params } = await setup();
    const request = new Request('http://localhost', { method: 'POST', body });
    if (type) request.headers.set('Content-Type', type);
    expect(await status(login({ request, params } as any))).toBe(400);
  });

  it('keeps the number of cookies small', async () => {
    const { link, params } = await setup();
    const names = Array.from(
      { length: 33 },
      (_, index) => `uteg_access_${String(index).padStart(26, '0')}`,
    );
    const cookies = ['a=b', ...names, `uteg_access_${link.id}`].map((name) => `${name}=x`);
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { Cookie: cookies.join('; ') },
      body: new URLSearchParams({ token: link.token }),
    });
    const response = await login({ request, params } as any);
    const [own, ...expired] = response.headers.getSetCookie();
    expect(own).toMatch(new RegExp(`^uteg_access_${link.id}=`));
    expect(own).toMatch(/Max-Age=1209600/);
    // Browsers send the oldest first. 29 others stay.
    expect(expired.map((cookie) => cookie.split('=')[0])).toEqual(names.slice(0, 4));
    for (const cookie of expired) expect(cookie).toMatch(/^\w+=; Max-Age=0; Path=\//);
  });

  it('sends events until the link is reset', async () => {
    const { id, link, params, request } = await setup();
    const open = async () => events({ request: await request(), params } as any);
    const reader = (await open()).body!.getReader();
    await reader.read();
    publish(id, 'grades');
    expect((await reader.read()).done).toBe(false);
    const old = await request();
    await resetToken(id, link.id);
    expect((await reader.read()).done).toBe(true);
    expect(await status(events({ request: old, params } as any) as Promise<unknown>)).toBe(403);
  });

  it('shows the images of the competition', async () => {
    const { id, request } = await setup();
    const other = await createCompetition();
    const load = async (competitionId: string, mimeType = 'image/png') => {
      const asset = await prisma.asset.create({
        data: { competitionId, mimeType, data: new Uint8Array([1]) },
      });
      const args = {
        request: await request(),
        params: { assetId: asset.id },
        context: new RouterContextProvider(),
      };
      return status(assetLoader(args as any));
    };
    expect(await load(id)).toBe(200);
    expect(await load(other.id)).toBe(404);
    expect(await load(id, 'application/pdf')).toBe(404);
  });
});
