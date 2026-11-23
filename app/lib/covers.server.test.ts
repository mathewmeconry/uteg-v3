import { degrees, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { createCompetition, errorCode, truncateTables } from '~/tests/helpers';
import { createCoverPdf, createPng, readPdf } from '~/tests/pdf';
import { removeCover, setCover } from './covers.server';
import { prisma } from './prisma.server';
import {
  createRankingTemplate,
  deleteRankingTemplate,
  duplicateRankingTemplate,
  getRankingTemplate,
  listRankingTemplates,
} from './rankingTemplates.server';

beforeEach(truncateTables);

async function setup() {
  const { id } = await createCompetition();
  const template = await createRankingTemplate(id, { name: 'A', options: {} });
  const set = (file: Uint8Array) => setCover(id, template.id, file);
  const read = async () => {
    const { cover } = await getRankingTemplate(id, template.id);
    return cover && readPdf(new Uint8Array(cover));
  };
  return { id, templateId: template.id, set, read };
}

describe('setCover', () => {
  it('stores all pages of a PDF, with their size and rotation', async () => {
    const { set, read } = await setup();
    await set(
      await createCoverPdf(['Eins', 'Zwei', 'Drei'], (document) => {
        document.getPage(1).setSize(842, 595);
        document.getPage(2).setRotation(degrees(90));
        document.addPage([300, 300]);
      }),
    );
    const pages = await read();
    expect(pages!.map(({ text }) => text)).toEqual(['Eins', 'Zwei', 'Drei', '']);
    expect(pages!.map(({ width, height }) => [width, height])).toEqual([
      [595, 842],
      [842, 595],
      [842, 595],
      [300, 300],
    ]);
  });

  it.each([
    [200, 100, 842],
    [100, 200, 595],
  ])('makes a page of a PNG with %s × %s pixels', async (width, height, pageWidth) => {
    const { set, read } = await setup();
    await set(createPng(width, height));
    const pages = await read();
    expect(pages).toHaveLength(1);
    expect(Math.round(pages![0].width)).toBe(pageWidth);
    expect(pages![0].images).toBe(1);
  });

  it('keeps nothing but what the pages show', async () => {
    const { id, templateId, set, read } = await setup();
    const file = await createCoverPdf(['Titel'], async (document) => {
      const { context, catalog } = document;
      document.addJavaScript('main', 'app.alert("evil")');
      await document.attach(new Uint8Array([1, 2, 3]), 'evil.exe');
      document.getForm().createTextField('evil').addToPage(document.getPage(0));
      const action = context.obj({
        S: 'Launch',
        F: PDFString.of('evil.exe'),
        Next: { S: 'URI', URI: PDFString.of('https://evil.example') },
      });
      catalog.set(PDFName.of('OpenAction'), action);
      catalog.set(PDFName.of('AA'), context.obj({ WC: action }));
      const page = document.getPage(0).node;
      page.set(PDFName.of('AA'), context.obj({ O: action }));
      page.set(
        PDFName.of('Annots'),
        context.obj([{ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 600, 800], A: action }]),
      );
    });
    expect(Buffer.from(file).toString('latin1')).toContain('evil');

    await set(file);
    expect((await read())![0].text).toBe('Titel');
    const { cover } = await getRankingTemplate(id, templateId);
    const document = await PDFDocument.load(cover!);
    const objects = document.context.enumerateIndirectObjects().map(([, object]) => String(object));
    const plain = objects.join('\n');
    expect(plain).not.toMatch(
      /evil|JavaScript|\/JS|Launch|OpenAction|\/AA|AcroForm|Annots \[ [^\]]|EmbeddedFile|\/URI/,
    );
  });

  it.each([
    ['nothing', new Uint8Array(), 'INVALID_COVER'],
    ['another file', new TextEncoder().encode('<svg/>'), 'INVALID_COVER'],
    ['a broken PDF', new TextEncoder().encode('%PDF-1.7 nothing'), 'INVALID_COVER'],
    ['a broken PNG', createPng(10, 10).slice(0, 45), 'INVALID_COVER'],
    ['a PNG without header', createPng(10, 10).slice(0, 10), 'INVALID_COVER'],
    ['a huge file', new Uint8Array(10 * 1024 * 1024 + 1), 'FILE_TOO_LARGE'],
  ])('rejects %s', async (_, file, code) => {
    const { set, read } = await setup();
    expect(await errorCode(set(file))).toBe(code);
    expect(await read()).toBeNull();
  });

  it('rejects too many pages, encrypted files and too many pixels', async () => {
    const { set } = await setup();
    const pages = await createCoverPdf(['1', '2', '3', '4', '5']);
    expect(await errorCode(set(pages))).toBe('COVER_TOO_MANY_PAGES');

    const encrypted = await createCoverPdf(['x'], ({ context }) => {
      context.trailerInfo.Encrypt = context.register(context.obj({ Filter: 'Standard', V: 1 }));
    });
    expect(await errorCode(set(encrypted))).toBe('COVER_ENCRYPTED');

    const huge = createPng(1, 1);
    new DataView(huge.buffer).setUint32(16, 40_000);
    new DataView(huge.buffer).setUint32(20, 1000);
    expect(await errorCode(set(huge))).toBe('COVER_TOO_MANY_PIXELS');
  });

  it('only changes templates of the competition', async () => {
    const { templateId, read, set } = await setup();
    const other = await createCompetition();
    const file = await createCoverPdf(['x']);
    expect(await errorCode(setCover(other.id, templateId, file))).toBe('NOT_FOUND');
    await set(file);
    expect(await errorCode(removeCover(other.id, templateId))).toBe('NOT_FOUND');
    expect(await read()).toHaveLength(1);
  });
});

describe('stored covers', () => {
  it('leave nothing behind when replaced or removed', async () => {
    const { id, templateId, set, read } = await setup();
    await set(await createCoverPdf(['Alt']));
    await set(await createCoverPdf(['Neu']));
    expect((await read())![0].text).toBe('Neu');
    expect(await prisma.asset.count()).toBe(1);
    await removeCover(id, templateId);
    await removeCover(id, templateId);
    expect(await read()).toBeNull();
    expect(await prisma.asset.count()).toBe(0);
  });

  it('are copied with the template and deleted with it', async () => {
    const { id, templateId, set } = await setup();
    await set(await createCoverPdf(['Titel']));
    await duplicateRankingTemplate(id, templateId, 'B');
    expect(await prisma.asset.count()).toBe(2);

    await deleteRankingTemplate(id, templateId);
    expect(await prisma.asset.count()).toBe(1);
    const [copy] = await listRankingTemplates(id);
    expect(copy).toMatchObject({ name: 'B', coverId: expect.any(String) });
    const { cover } = await getRankingTemplate(id, copy.id);
    expect((await readPdf(new Uint8Array(cover!)))[0].text).toBe('Titel');

    await prisma.competition.delete({ where: { id } });
    expect(await prisma.asset.count()).toBe(0);
  });
});
