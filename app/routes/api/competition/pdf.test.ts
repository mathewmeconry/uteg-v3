import { beforeEach, describe, expect, it } from 'vitest';
import { rankingTemplateSchema } from '~/lib/domain/rankingTemplate';
import { accessUrl, getOrCreateJudgeLinks, logIn, resolveAccess } from '~/lib/access.server';
import { setCover } from '~/lib/covers.server';
import { prisma } from '~/lib/prisma.server';
import { createRankingTemplate } from '~/lib/rankingTemplates.server';
import { assignTemplate } from '~/lib/templateAssignments.server';
import {
  createClub,
  createCompetition,
  createDivision,
  createStarter,
  truncateTables,
} from '~/tests/helpers';
import { createJpeg, createPng } from '~/tests/images';
import { findOverlaps, readPdf } from '~/tests/pdf';
import { callRoute } from '~/tests/routes';
import * as manual from './judgingManualPdf';
import * as sheets from './judgingSheetsPdf';
import * as ranking from './rankingPdf';
import * as starters from './startersPdf';

beforeEach(truncateTables);

async function readText(response: Response) {
  expect(response.status).toBe(200);
  return (await readPdf(response)).map(({ text }) => text);
}

function expectPdfHeaders(response: Response) {
  expect(response.headers.get('Content-Type')).toBe('application/pdf');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Content-Disposition')).toMatch(/^inline; filename="[ -~]+\.pdf"/);
}

describe('ranking', () => {
  async function setup() {
    const { id, contest } = await createCompetition();
    const k5 = await createDivision(contest.id, { state: 'ENDED' });
    const k6 = await createDivision(contest.id, { category: 'K6', sex: 'MALE', state: 'RUNNING' });
    await createStarter(id, {
      firstname: 'Zoé',
      lastname: 'Müller',
      divisionId: k5.id,
      startApparatus: 'reck',
      grades: { reck: 9250 },
    });
    await createStarter(id, {
      firstname: 'Noah',
      lastname: 'Frei',
      sex: 'MALE',
      category: 'K6',
      divisionId: k6.id,
      startApparatus: 'reck',
      grades: { reck: 8000 },
    });
    return { id, contest };
  }

  it('contains one or several categories, also for viewers', async () => {
    const { id, contest } = await setup();
    const call = (search: string) =>
      callRoute(ranking.loader, { competitionId: id, role: 'VIEWER', search });

    const one = await call(`?contest=${contest.id}&group=FEMALE:K5`);
    expectPdfHeaders(one);
    const [page] = await readText(one);
    expect(page).toContain('Zoé Müller');
    expect(page).toContain('9.25');

    const several = await call(`?contest=${contest.id}&group=FEMALE:K5&group=MALE:K6`);
    const pages = await readText(several);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain('Keine Resultate');

    expect(pages[1]).toContain('Unvollständig');
    // Only the Reck grade of K5 is there.
    expect(pages[0]).toContain('3 Noten fehlen');

    const provisional = await call(`?contest=${contest.id}&group=MALE:K6&provisional=1`);
    expect((await readText(provisional))[0]).toMatch(/Provisorisch.*Noah Frei/);
  });

  it('uses the default or the chosen template', async () => {
    const { id, contest } = await setup();
    await createRankingTemplate(id, {
      name: 'A',
      options: rankingTemplateSchema.parse({ title: 'Titel A' }),
    });
    const { id: templateId } = await createRankingTemplate(id, {
      name: 'B',
      options: rankingTemplateSchema.parse({ title: 'Titel B' }),
    });
    const call = async (template: string) =>
      readText(
        await callRoute(ranking.loader, {
          competitionId: id,
          role: 'VIEWER',
          search: `?contest=${contest.id}&group=FEMALE:K5&template=${template}`,
        }),
      );
    expect((await call(''))[0]).toContain('Titel A');
    expect((await call(templateId))[0]).toContain('Titel B');
  });

  describe('with a cover', () => {
    async function setupCover(options: object = {}) {
      const { id, contest } = await setup();
      const template = await createRankingTemplate(id, {
        name: 'A',
        options: rankingTemplateSchema.parse(options),
      });
      await setCover(id, template.id, COVER);
      const load = async (provisional = '') => {
        const response = await callRoute(ranking.loader, {
          competitionId: id,
          role: 'VIEWER',
          search: `?contest=${contest.id}&group=FEMALE:K5&group=MALE:K6${provisional}`,
        });
        return Buffer.from(await response.arrayBuffer());
      };
      return { id, template, load };
    }

    const COVER = [createJpeg(200, 100), createJpeg(100, 200)];

    /** "wide" and "high" covers, or the start of a page and its number. */
    const describePages = async (pdf: Uint8Array) =>
      (await readPdf(new Uint8Array(pdf))).map(({ text, width, height }) => {
        if (!text) return width > height ? 'wide' : 'high';
        return `${/K5 Turnerinnen|K6 Turner|K5, K6/.exec(text)} ${/\d \/ \d$/.exec(text)}`;
      });

    it('starts the file with it and does not count it as a page', async () => {
      const { load } = await setupCover();
      expect(await describePages(await load('&provisional=1'))).toEqual([
        ...['wide', 'high', 'K5 Turnerinnen 1 / 2', 'K6 Turner 2 / 2'],
      ]);
    });

    it('can be before every category, and is in the file once and as it is', async () => {
      const { load } = await setupCover({ cover: 'eachCategory' });
      const pdf = await load();
      expect(await describePages(pdf)).toEqual([
        ...['wide', 'high', 'K5 Turnerinnen 1 / 2'],
        ...['wide', 'high', 'K6 Turner 2 / 2'],
      ]);
      for (const page of COVER) {
        expect(pdf.indexOf(page)).toBeGreaterThan(0);
        expect(pdf.lastIndexOf(page)).toBe(pdf.indexOf(page));
      }
      // Categories on the same page have one.
      const shared = await setupCover({ cover: 'eachCategory', newPagePerCategory: false });
      expect(await describePages(await shared.load())).toEqual(['wide', 'high', 'K5, K6 1 / 1']);
    });

    it('is before the first of several pages', async () => {
      const { id, load } = await setupCover({ cover: 'eachCategory', rowHeight: 40 });
      const division = await prisma.division.findFirstOrThrow({
        where: { category: 'K5', contest: { competitionId: id } },
      });
      for (let index = 0; index < 25; index++) {
        await createStarter(id, { divisionId: division.id, startApparatus: 'reck' });
      }
      expect(await describePages(await load())).toEqual([
        ...['wide', 'high', 'K5 Turnerinnen 1 / 3', 'K5 Turnerinnen 2 / 3'],
        ...['wide', 'high', 'K6 Turner 3 / 3'],
      ]);
    });

    it('belongs to the template of each category', async () => {
      const { id, contest } = await setup();
      const create = async (name: string, options: object) =>
        (
          await createRankingTemplate(id, {
            name,
            options: rankingTemplateSchema.parse({ ...options, footer: `Fuss ${name}` }),
          })
        ).id;
      await create('Standard', {});
      const men = await create('Turner', { orientation: 'landscape' });
      await setCover(id, men, COVER);
      await assignTemplate(id, men, { sex: 'MALE', category: 'K6' });

      const load = (template: string) =>
        callRoute(ranking.loader, {
          competitionId: id,
          role: 'VIEWER',
          search: `?contest=${contest.id}&group=FEMALE:K5&group=MALE:K6&template=${template}`,
        });
      const pages = await readPdf(await load('auto'));
      // The default one has no cover, then the cover of the other and its landscape page.
      expect(pages.map(({ width, height }) => width > height)).toEqual([false, true, false, true]);
      expect(pages[0].text).toMatch(/K5 Turnerinnen.*Fuss Standard.*1 \/ 2$/);
      expect(pages[1].text + pages[2].text).toBe('');
      expect(pages[3].text).toMatch(/K6 Turner.*Fuss Turner.*2 \/ 2$/);

      // One for all if it is chosen.
      const same = await readPdf(await load(men));
      expect(same.map(({ text }) => /Fuss \w+/.exec(text)?.[0])).toEqual([
        ...[undefined, undefined, 'Fuss Turner', 'Fuss Turner'],
      ]);
    });

    it('keeps the order of categories, and is once where its template starts', async () => {
      const { id, contest } = await createCompetition();
      const create = async (name: string, options: object, cover: Uint8Array[]) => {
        const template = await createRankingTemplate(id, {
          name,
          options: rankingTemplateSchema.parse(options),
        });
        await setCover(id, template.id, cover);
        return template.id;
      };
      const a = await create('A', {}, [COVER[0]]);
      const b = await create('B', { cover: 'eachCategory' }, [COVER[1]]);
      for (const [template, categories] of [
        [a, ['K1', 'K3', 'K4']],
        [b, ['K2', 'K5']],
      ] as const) {
        for (const category of categories) {
          await assignTemplate(id, template, { sex: 'FEMALE', category });
        }
      }
      const groups = ['K1', 'K2', 'K3', 'K4', 'K5'].map((key) => `&group=FEMALE:${key}`).join('');
      const load = () =>
        callRoute(ranking.loader, {
          competitionId: id,
          role: 'VIEWER',
          search: `?contest=${contest.id}${groups}&template=auto`,
        });
      const pages = await readPdf(await load());
      expect(
        pages.map(({ text, width, height }) =>
          text ? /K\d Turnerinnen/.exec(text)![0] : width > height ? 'A' : 'B',
        ),
      ).toEqual([
        ...['A', 'K1 Turnerinnen'],
        ...['B', 'K2 Turnerinnen'],
        ...['K3 Turnerinnen', 'K4 Turnerinnen'],
        ...['B', 'K5 Turnerinnen'],
      ]);
      expect(pages.at(-1)!.text).toMatch(/5 \/ 5$/);

      // Four pages of almost 2 MB each, for five templates.
      const large = createJpeg(200, 100, { scanBytes: 2_000_000 });
      await setCover(id, a, [large, large, large, large]);
      await setCover(id, b, [large, large, large, large]);
      expect((await load()).status).toBe(200);
      for (const category of ['K2', 'K3', 'K4']) {
        const template = await create(category, {}, [large, large, large, large]);
        await assignTemplate(id, template, { sex: 'FEMALE', category });
      }
      expect((await load()).status).toBe(503);
    });

    it('is left out when it is damaged', async () => {
      const { id, load } = await setupCover();
      await prisma.asset.updateMany({
        where: { competitionId: id },
        data: { data: new Uint8Array([1, 2, 3]) },
      });
      expect(await describePages(await load())).toEqual([
        ...['K5 Turnerinnen 1 / 2', 'K6 Turner 2 / 2'],
      ]);
    });

    it('is in the preview', async () => {
      const { id, template } = await setupCover();
      const preview = (form: [string, string][]) =>
        callRoute(ranking.action, {
          competitionId: id,
          role: 'EDITOR',
          form: [['options', '{}'], ...form],
        });
      const count = async (form: [string, string][]) =>
        (await readText(await preview(form))).length;
      expect(await count([])).toBe(2);
      expect(await count([['template', template.id]])).toBe(4);
      const other = await setupCover();
      expect((await preview([['template', other.template.id]])).status).toBe(404);
    });
  });

  it('leaves out a stored logo that must not be rendered', async () => {
    const { id, contest } = await setup();
    const load = async (data: Uint8Array<ArrayBuffer>) => {
      const logo = { competitionId: id, mimeType: 'image/png', data };
      await prisma.asset.deleteMany();
      await prisma.competition.update({ where: { id }, data: { logo: { create: logo } } });
      const response = await callRoute(ranking.loader, {
        competitionId: id,
        role: 'VIEWER',
        search: `?contest=${contest.id}&group=FEMALE:K5`,
      });
      return (await readPdf(response))[0].images;
    };
    expect(await load(createPng(10, 10))).toBe(1);
    expect(await load(createPng(10, 10, { pixels: Buffer.alloc(1e6) }))).toBe(0);
  });

  it('answers unknown and foreign ids with 404, missing ones with 400', async () => {
    const { id, contest } = await setup();
    const other = await createCompetition();
    const template = await createRankingTemplate(other.id, {
      name: 'X',
      options: rankingTemplateSchema.parse({}),
    });
    const status = async (search: string, role: 'VIEWER' | undefined = 'VIEWER') =>
      (await callRoute(ranking.loader, { competitionId: id, role, search })).status;

    expect(await status(`?contest=${other.contest.id}&group=FEMALE:K5`)).toBe(404);
    expect(await status(`?contest=${contest.id}&group=FEMALE:KH`)).toBe(404);
    expect(await status(`?contest=${contest.id}&group=FEMALE:K5&template=${template.id}`)).toBe(
      404,
    );
    expect(await status('?contest=%00&group=FEMALE:K5')).toBe(404);
    expect(await status(`?contest=${contest.id}`)).toBe(400);
    expect(await status(`?contest=${contest.id}&group=K5`)).toBe(400);
  });

  it('hides everything from strangers', async () => {
    const { id, contest } = await setup();
    const search = `?contest=${contest.id}&group=FEMALE:K5`;
    const response = await callRoute(ranking.loader, { competitionId: id, search });
    expect(response.status).toBe(404);
  });

  it('previews unsaved options with sample or real data for editors', async () => {
    const { id, contest } = await setup();
    const options: [string, string] = ['options', JSON.stringify({ title: 'Vorschau {category}' })];
    const call = (form: [string, string][], role: 'VIEWER' | 'EDITOR' = 'EDITOR') =>
      callRoute(ranking.action, { competitionId: id, role, form });

    expect((await readText(await call([options])))[0]).toContain('Vorschau K5');
    const real = await call([options, ['contest', contest.id], ['group', 'FEMALE:K5']]);
    expect((await readText(real))[0]).toContain('Zoé Müller');

    expect((await call([options], 'VIEWER')).status).toBe(403);
    expect((await call([['options', '{"fontSize":99}']])).status).toBe(400);
    expect((await call([['options', '{']])).status).toBe(400);
    expect((await call([options, ['contest', '\0'], ['group', 'FEMALE:K5']])).status).toBe(400);
    const text = await callRoute(ranking.action, {
      competitionId: id,
      role: 'EDITOR',
      text: 'x',
    });
    expect(text.status).toBe(400);
    const other = await createCompetition();
    const foreign = await call([options, ['contest', other.contest.id], ['group', 'FEMALE:K5']]);
    expect(foreign.status).toBe(404);
  });
});

describe('judging sheets', () => {
  async function setup() {
    const { id, contest } = await createCompetition({ grounds: 2 });
    const division = await createDivision(contest.id, { state: 'RUNNING' });
    const add = (firstname: string, data: object = {}) =>
      createStarter(id, {
        firstname,
        lastname: 'Frei',
        divisionId: division.id,
        startApparatus: 'reck',
        ...data,
      });
    return { id, contest, division, add };
  }

  it('has a page per apparatus and round with vault columns and pauses', async () => {
    const { id, division, add } = await setup();
    await add('Anna');
    await add('Bea');
    const response = await callRoute(sheets.loader, {
      competitionId: id,
      role: 'VIEWER',
      search: `?division=${division.id}`,
    });
    expectPdfHeaders(response);
    const pages = await readText(response);
    // Women: 4 apparatus, 4 rounds.
    expect(pages).toHaveLength(16);
    expect(pages[0]).toMatch(
      /Gerätecup.*Wettkampfplatz 1.*Reck.*Durchgang 1.*K5 Turnerinnen, Abteilung 1/,
    );
    expect(pages[0]).toMatch(/1 Anna Frei.*2 Bea Frei/);
    expect(pages[0]).not.toContain('Versuch');
    expect(pages[0]).not.toContain('sheets.');
    expect(pages[1]).toMatch(/Durchgang 2.*Pause/);

    // They start on Reck and reach the vault in the fourth round, where the list is rotated.
    const vault = pages.find((page) => /Sprung.*Durchgang 4/.test(page))!;
    expect(vault).toMatch(/1\. Versuch.*2\. Versuch.*Endnote/);
    expect(vault).toContain('Maximum');
    expect(vault).toMatch(/1 Bea Frei.*2 Anna Frei/);
  });

  it('uses the rule of the category', async () => {
    const { id, contest } = await setup();
    const k6 = await createDivision(contest.id, { category: 'K6' });
    await createStarter(id, { category: 'K6', divisionId: k6.id, startApparatus: 'sprung' });
    const pages = await readText(
      await callRoute(sheets.loader, {
        competitionId: id,
        role: 'VIEWER',
        search: `?division=${k6.id}`,
      }),
    );
    expect(pages.find((page) => /Sprung.*Durchgang 1/.test(page))).toContain('Durchschnitt');
  });

  it('marks withdrawn starters and keeps their slot', async () => {
    const { id, division, add } = await setup();
    await add('Anna', { withdrawnAt: new Date() });
    await add('Bea');
    const [page] = await readText(
      await callRoute(sheets.loader, {
        competitionId: id,
        role: 'VIEWER',
        search: `?division=${division.id}`,
      }),
    );
    expect(page).toMatch(/1 Anna Frei.*abgemeldet.*2 Bea Frei/);
  });

  it('repeats the header on further pages without overlaps', async () => {
    const { id, division, add } = await setup();
    const club = await createClub({ name: 'Turnverein Schönenwerd-Niedergösgen-Oberdorf' });
    for (let index = 0; index < 40; index++) {
      await add('Maximiliane-Alexandra', {
        lastname: `Wolfeschlegelsteinhausenberger${index}`,
        clubId: club.id,
        startApparatus: 'sprung',
      });
    }
    const response = await callRoute(sheets.loader, {
      competitionId: id,
      role: 'VIEWER',
      search: `?division=${division.id}`,
    });
    const pages = (await readPdf(response)).filter(
      ({ text }) => /Sprung/.test(text) && /Durchgang 1/.test(text),
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const { text, items } of pages) {
      expect(text).toContain('Endnote');
      expect(findOverlaps(items)).toEqual([]);
    }
  }, 20_000);

  it('prints the running divisions of a ground, or a note', async () => {
    const { id, contest, add } = await setup();
    await add('Anna');
    const ended = await createDivision(contest.id, { number: 2, state: 'ENDED' });
    await add('Ended', { divisionId: ended.id, startApparatus: 'reck' });
    const call = async (ground: string) =>
      callRoute(sheets.loader, { competitionId: id, role: 'VIEWER', search: `?ground=${ground}` });
    const [page] = await readText(await call('1'));
    expect(page).toContain('Anna');
    expect(page).not.toContain('Ended');
    expect(await readText(await call('2'))).toEqual(['Auf diesem Platz läuft keine Abteilung.']);
    expect((await call('3')).status).toBe(404);
    expect((await call('x')).status).toBe(400);
  });

  it('keeps grounds apart and takes many divisions as a form', async () => {
    const { id, contest, division, add } = await setup();
    await add('Anna');
    const second = await createDivision(contest.id, { sex: 'MALE', ground: 2 });
    await createStarter(id, {
      firstname: 'Noah',
      sex: 'MALE',
      divisionId: second.id,
      startApparatus: 'boden',
    });
    const pages = await readText(
      await callRoute(sheets.action, {
        competitionId: id,
        role: 'VIEWER',
        form: [
          ['division', second.id],
          ['division', division.id],
        ],
      }),
    );
    expect(pages).toHaveLength(16 + 25);
    expect(pages[0]).toContain('Wettkampfplatz 1');
    expect(pages[0]).not.toContain('Noah');
    expect(pages[16]).toMatch(/Wettkampfplatz 2.*Noah/);
  });

  it('answers foreign ids with 404 and nothing with 400', async () => {
    const { id, division } = await setup();
    const other = await setup();
    const call = async (form: [string, string][], role: 'VIEWER' | undefined = 'VIEWER') =>
      (await callRoute(sheets.action, { competitionId: id, role, form })).status;
    expect(
      await call([
        ['division', division.id],
        ['division', other.division.id],
      ]),
    ).toBe(404);
    expect(await call([])).toBe(400);
    const stranger = await callRoute(sheets.loader, {
      competitionId: id,
      search: `?division=${division.id}`,
    });
    expect(stranger.status).toBe(404);
  });
});

describe('starters', () => {
  async function setup() {
    const { id, contest } = await createCompetition();
    const division = await createDivision(contest.id);
    const [chur, aarau] = [
      await createClub({ name: 'TV Chur', location: 'Chur' }),
      await createClub({ name: 'Aarau Getu', location: 'Aarau' }),
    ];
    const anna = await createStarter(id, {
      firstname: 'Anna',
      lastname: 'Ägerter',
      clubId: chur.id,
      divisionId: division.id,
      startApparatus: 'schaukelringe',
    });
    const bea = await createStarter(id, { firstname: 'Bea', lastname: 'Frei', clubId: aarau.id });
    return { id, anna, bea };
  }

  it('groups all starters by club', async () => {
    const { id } = await setup();
    const response = await callRoute(starters.loader, { competitionId: id, role: 'VIEWER' });
    expectPdfHeaders(response);
    const [page] = await readText(response);
    expect(page).toMatch(/Aarau Getu.*Frei Bea.*TV Chur.*Ägerter Anna.*K5 1 Schaukelringe/);
  });

  it('only contains the given ids', async () => {
    const { id, anna } = await setup();
    const [page] = await readText(
      await callRoute(starters.action, {
        competitionId: id,
        role: 'VIEWER',
        form: [['id', anna.id]],
      }),
    );
    expect(page).toContain('Ägerter');
    expect(page).not.toContain('Frei');
  });

  it('answers foreign ids with 404', async () => {
    const { id, anna } = await setup();
    const other = await createCompetition();
    const foreign = await createStarter(other.id);
    const response = await callRoute(starters.action, {
      competitionId: id,
      role: 'VIEWER',
      form: [
        ['id', anna.id],
        ['id', foreign.id],
      ],
    });
    expect(response.status).toBe(404);
    const stranger = await callRoute(starters.loader, { competitionId: id });
    expect(stranger.status).toBe(404);
    const gradeEntry = await callRoute(starters.loader, { competitionId: id, role: 'GRADE_ENTRY' });
    expect(gradeEntry.status).toBe(403);
  });

  it('repeats the header of a club on the next page', async () => {
    const { id } = await createCompetition();
    const club = await createClub({ name: 'Donaudampfschifffahrtsgesellschaftsturnverein' });
    for (let index = 0; index < 60; index++) await createStarter(id, { clubId: club.id });
    const pages = await readPdf(
      await callRoute(starters.loader, { competitionId: id, role: 'VIEWER' }),
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const { text, items } of pages) {
      expect(text).toContain('Startgerät');
      expect(findOverlaps(items)).toEqual([]);
    }
  });
});

describe('judging manual', () => {
  it('has a page per link for editors', async () => {
    const { id } = await createCompetition({ grounds: 2 });
    const [link] = await getOrCreateJudgeLinks(id);
    const call = (search: string) =>
      callRoute(manual.loader, { competitionId: id, role: 'EDITOR', search });

    const all = await call('');
    expectPdfHeaders(all);
    const pages = await readPdf(all);
    expect(pages).toHaveLength(10);
    expect(findOverlaps(pages[0].items)).toEqual([]);
    expect(pages[0].text).not.toContain('manual.');
    const ground = await readText(await call('?ground=2'));
    expect(ground).toHaveLength(5);
    expect(ground[4]).toContain('Barren · Wettkampfplatz 2');
    const one = await readPdf(await call(`?link=${link.id}`));
    expect(one).toHaveLength(1);
    expect(one[0].text).toContain('Reck · Wettkampfplatz 1');
    expect(one[0].links).toEqual([accessUrl(link)]);
  });

  it('is in the chosen language', async () => {
    const { id } = await createCompetition();
    const call = async (language: string) =>
      readText(
        await callRoute(manual.loader, {
          competitionId: id,
          role: 'EDITOR',
          cookie: `language=x; documentLanguage=${language}`,
        }),
      );
    expect((await call('en'))[0]).toContain('Horizontal bar · Ground 1');
    // The one of the app.
    expect((await call('xx'))[0]).toContain('Reck · Wettkampfplatz 1');
  });

  it('prints a link that opens the tablet', async () => {
    const { id } = await createCompetition();
    const [, link] = await getOrCreateJudgeLinks(id);
    const response = await callRoute(manual.loader, {
      competitionId: id,
      role: 'EDITOR',
      search: `?link=${link.id}`,
    });
    const url = new URL((await readPdf(response))[0].links[0]);
    const [, kind, linkId] = /^\/(\w+)\/(\w+)$/.exec(url.pathname)!;
    expect(kind).toBe('judge');

    // What AccessGate does with the key.
    const login = await logIn(
      new Request(`${url.origin}/api${url.pathname}/login`, {
        method: 'POST',
        body: new URLSearchParams({ token: url.hash.slice(1) }),
      }),
      linkId,
      'JUDGE',
    );
    const [cookie] = login.headers.getSetCookie()[0].split(';');
    const tablet = new Request(url, { headers: { Cookie: cookie } });
    expect(await resolveAccess(tablet, linkId, 'JUDGE')).toMatchObject({ id: link.id });
  });

  it('denies viewers and hides foreign links', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const [foreign] = await getOrCreateJudgeLinks(other.id);
    const status = async (role: 'VIEWER' | 'EDITOR' | undefined, search = '') =>
      (await callRoute(manual.loader, { competitionId: id, role, search })).status;
    expect(await status('VIEWER')).toBe(403);
    expect(await status(undefined)).toBe(404);
    expect(await status('EDITOR', `?link=${foreign.id}`)).toBe(404);
    expect(await status('EDITOR', '?ground=9')).toBe(404);
    expect(await status('EDITOR', '?ground=x')).toBe(400);
  });
});
