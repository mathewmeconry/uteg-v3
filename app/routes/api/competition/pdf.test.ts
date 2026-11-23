import { beforeEach, describe, expect, it } from 'vitest';
import { rankingTemplateSchema } from '~/lib/domain/rankingTemplate';
import { accessUrl, getOrCreateJudgeLinks } from '~/lib/access.server';
import { createRankingTemplate } from '~/lib/rankingTemplates.server';
import {
  createClub,
  createCompetition,
  createDivision,
  createStarter,
  truncateTables,
} from '~/tests/helpers';
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
      lineupId: k5.lineup('reck'),
      grades: { reck: 9250 },
    });
    await createStarter(id, {
      firstname: 'Noah',
      lastname: 'Frei',
      sex: 'MALE',
      category: 'K6',
      divisionId: k6.id,
      lineupId: k6.lineup('reck'),
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
        lineupId: division.lineup('reck'),
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
    await createStarter(id, { category: 'K6', divisionId: k6.id, lineupId: k6.lineup('sprung') });
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
        lineupId: division.lineup('sprung'),
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
    await add('Ended', { divisionId: ended.id, lineupId: ended.lineup('reck') });
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
      lineupId: second.lineup('reck'),
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
      lineupId: division.lineup('schaukelringe'),
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
