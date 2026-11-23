import { createCompetition, errorCode, truncateTables } from '~/tests/helpers';
import { getLogo, removeLogo, setLogo } from './assets.server';
import { prisma } from './prisma.server';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(truncateTables);

describe('setLogo', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
  ])('stores %s by its content', async (mimeType, data) => {
    const { id } = await createCompetition();
    await setLogo(id, data);
    expect(await getLogo(id)).toMatchObject({ mimeType, data });
  });

  it('replaces the old logo', async () => {
    const { id } = await createCompetition();
    await setLogo(id, PNG);
    await setLogo(id, JPEG);
    expect(await getLogo(id)).toMatchObject({ mimeType: 'image/jpeg' });
    expect(await prisma.asset.count()).toBe(1);
  });

  it('rejects other content', async () => {
    const { id } = await createCompetition();
    for (const text of ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'GIF89a', '']) {
      const data = new TextEncoder().encode(text);
      expect(await errorCode(setLogo(id, data))).toBe('INVALID_IMAGE');
    }
    expect(await getLogo(id)).toBeNull();
  });

  it('allows 5 MB and rejects more', async () => {
    const { id } = await createCompetition();
    const data = new Uint8Array(5 * 1024 * 1024 + 1);
    data.set(PNG);
    expect(await errorCode(setLogo(id, data))).toBe('FILE_TOO_LARGE');
    await setLogo(id, data.slice(0, -1));
  });

  it('allows 4000 pixels and rejects more', async () => {
    const { id } = await createCompetition();
    const png = (width: number, height: number) => {
      const data = new Uint8Array(24);
      data.set([...PNG.slice(0, 8), 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
      new DataView(data.buffer).setUint32(16, width);
      new DataView(data.buffer).setUint32(20, height);
      return data;
    };
    await setLogo(id, png(4000, 4000));
    expect(await errorCode(setLogo(id, png(4001, 10)))).toBe('IMAGE_TOO_LARGE');
    expect(await errorCode(setLogo(id, png(10, 4001)))).toBe('IMAGE_TOO_LARGE');
  });

  it('rejects an unknown competition', async () => {
    expect(await errorCode(setLogo('nope', PNG))).toBe('NOT_FOUND');
  });
});

describe('removeLogo', () => {
  it('deletes the image', async () => {
    const { id } = await createCompetition();
    await setLogo(id, PNG);
    await removeLogo(id);
    await removeLogo(id);
    expect(await getLogo(id)).toBeNull();
    expect(await prisma.asset.count()).toBe(0);
  });
});
