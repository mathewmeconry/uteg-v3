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
    const load = async (competitionId: string) => {
      const asset = await prisma.asset.create({
        data: { competitionId, mimeType: 'image/png', data: new Uint8Array([1]) },
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
  });
});
