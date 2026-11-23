import { Prisma } from '~/generated/prisma/client';
import { createCompetition, errorCode, truncateTables } from '~/tests/helpers';
import { defaultRankingTemplate, rankingTemplateSchema } from './domain/rankingTemplate';
import { prisma } from './prisma.server';
import {
  createRankingTemplate,
  deleteRankingTemplate,
  getRankingTemplate,
  listRankingTemplates,
  setDefaultRankingTemplate,
  updateRankingTemplate,
} from './rankingTemplates.server';

beforeEach(truncateTables);

const defaults = async (id: string) =>
  (await listRankingTemplates(id)).filter(({ isDefault }) => isDefault).map(({ name }) => name);

describe('rankingTemplateSchema', () => {
  it('fills in defaults', () => {
    expect(rankingTemplateSchema.parse({})).toEqual(defaultRankingTemplate);
    expect(rankingTemplateSchema.parse({ columns: { club: false } }).columns).toEqual({
      ...defaultRankingTemplate.columns,
      club: false,
    });
  });

  it.each([
    { accentColor: 'red' },
    { accentColor: '#12345' },
    { decimals: 4 },
    { medalStyle: 'x' },
    { orientation: 'x' },
    { fontSize: 100 },
    { rowHeight: 0 },
    { title: 'x'.repeat(201) },
  ])('rejects %j', (options) => {
    expect(rankingTemplateSchema.safeParse(options).success).toBe(false);
  });
});

describe('stored options that are no longer valid', () => {
  it.each([
    [
      { title: 'Titel', footer: 'a\n'.repeat(20) },
      { title: 'Titel', footer: '' },
    ],
    [
      { decimals: 3, columns: 'x' },
      { decimals: 3, columns: defaultRankingTemplate.columns },
    ],
    ['x', {}],
    [null, {}],
  ])('get defaults: %j', async (stored, expected) => {
    const { id } = await createCompetition();
    await createRankingTemplate(id, { name: 'A', options: {} });
    await prisma.rankingTemplate.updateMany({
      data: { options: stored ?? Prisma.JsonNull },
    });
    const options = { ...defaultRankingTemplate, ...expected };
    expect(await listRankingTemplates(id)).toMatchObject([{ name: 'A', options }]);
    expect(await getRankingTemplate(id, null)).toEqual({ options, cover: [] });
  });
});

describe('ranking templates', () => {
  it('uses the built-in look without templates', async () => {
    const { id } = await createCompetition();
    expect(await getRankingTemplate(id, null)).toEqual({
      options: defaultRankingTemplate,
      cover: [],
    });
  });

  it('finds one of the competition', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const { id: templateId } = await createRankingTemplate(id, {
      name: 'A',
      options: { title: 'T' },
    });
    expect((await getRankingTemplate(id, templateId)).options.title).toBe('T');
    expect(await errorCode(getRankingTemplate(other.id, templateId))).toBe('NOT_FOUND');
  });

  it('makes the first one the default', async () => {
    const { id } = await createCompetition();
    await createRankingTemplate(id, { name: 'A', options: { title: 'T' } });
    await createRankingTemplate(id, { name: 'B', options: {} });
    expect(await defaults(id)).toEqual(['A']);
    expect(await getRankingTemplate(id, null)).toMatchObject({ options: { title: 'T' } });
  });

  it('has exactly one default', async () => {
    const { id } = await createCompetition();
    await createRankingTemplate(id, { name: 'A', options: {} });
    const b = await createRankingTemplate(id, { name: 'B', options: {} });
    await setDefaultRankingTemplate(id, b.id);
    expect(await defaults(id)).toEqual(['B']);
    await deleteRankingTemplate(id, b.id);
    expect(await defaults(id)).toEqual(['A']);
  });

  it('has one default after concurrent creates', async () => {
    const { id } = await createCompetition();
    await Promise.all(
      ['A', 'B', 'C'].map((name) => createRankingTemplate(id, { name, options: {} })),
    );
    expect(await defaults(id)).toHaveLength(1);
  });

  it('updates name and options', async () => {
    const { id } = await createCompetition();
    const { id: templateId } = await createRankingTemplate(id, { name: 'A', options: {} });
    await updateRankingTemplate(id, templateId, { name: 'B', options: { decimals: 3 } });
    expect(await listRankingTemplates(id)).toMatchObject([
      { name: 'B', options: { ...defaultRankingTemplate, decimals: 3 } },
    ]);
  });

  it('rejects invalid input', async () => {
    const { id } = await createCompetition();
    const badOptions = createRankingTemplate(id, { name: 'A', options: { decimals: 9 as any } });
    expect(await errorCode(badOptions)).toBe('INVALID_INPUT');
    expect(await errorCode(createRankingTemplate(id, { name: ' ', options: {} }))).toBe(
      'INVALID_INPUT',
    );
  });

  it('stays within the competition', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const template = await createRankingTemplate(other.id, { name: 'A', options: {} });
    expect(await errorCode(deleteRankingTemplate(id, template.id))).toBe('NOT_FOUND');
    expect(await errorCode(setDefaultRankingTemplate(id, template.id))).toBe('NOT_FOUND');
    expect(
      await errorCode(updateRankingTemplate(id, template.id, { name: 'B', options: {} })),
    ).toBe('NOT_FOUND');
    expect(await listRankingTemplates(id)).toEqual([]);
  });
});
