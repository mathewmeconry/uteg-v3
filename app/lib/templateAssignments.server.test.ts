import { createCompetition, errorCode, truncateTables } from '~/tests/helpers';
import { prisma } from './prisma.server';
import {
  createRankingTemplate,
  deleteRankingTemplate,
  duplicateRankingTemplate,
  listRankingTemplates,
} from './rankingTemplates.server';
import { assignTemplate, groupByTemplate, unassignTemplate } from './templateAssignments.server';

beforeEach(truncateTables);

const K1 = { sex: 'FEMALE', category: 'K1' } as const;
const K1_MEN = { sex: 'MALE', category: 'K1' } as const;
const K2 = { sex: 'FEMALE', category: 'K2' } as const;

async function setup() {
  const { id, contest } = await createCompetition();
  const create = async (name: string) =>
    (await createRankingTemplate(id, { name, options: {} })).id;
  const [a, b] = [await create('A'), await create('B')];
  const list = async () =>
    Object.fromEntries(
      (await listRankingTemplates(id)).map(({ name, assignments }) => [
        name,
        assignments.map(({ sex, category }) => `${category} ${sex}`),
      ]),
    );
  return { id, contest, a, b, list };
}

describe('assignTemplate', () => {
  it('gives a template several categories, and moves those of others', async () => {
    const { id, a, b, list } = await setup();
    expect(await assignTemplate(id, a, K1)).toBeNull();
    expect(await assignTemplate(id, a, K1_MEN)).toBeNull();
    expect(await assignTemplate(id, a, K1)).toBeNull();
    expect(await list()).toEqual({ A: ['K1 FEMALE', 'K1 MALE'], B: [] });

    expect(await assignTemplate(id, b, K1)).toBe('A');
    expect(await list()).toEqual({ A: ['K1 MALE'], B: ['K1 FEMALE'] });
  });

  it('rejects categories no contest has for the sex', async () => {
    const { id, a } = await setup();
    for (const group of [
      { sex: 'FEMALE', category: 'KH' },
      { sex: 'MALE', category: 'nope' },
    ] as const) {
      expect(await errorCode(assignTemplate(id, a, group))).toBe('INVALID_CATEGORY');
    }
  });

  it('keeps competitions apart', async () => {
    const one = await setup();
    const other = await setup();
    expect(await errorCode(assignTemplate(other.id, one.a, K1))).toBe('NOT_FOUND');
    await assignTemplate(one.id, one.a, K1);
    await assignTemplate(other.id, other.b, K1);
    expect(await one.list()).toEqual({ A: ['K1 FEMALE'], B: [] });
    await unassignTemplate(other.id, one.a, K1);
    expect(await one.list()).toEqual({ A: ['K1 FEMALE'], B: [] });
  });

  it('leaves a category to one template when several are assigned at once', async () => {
    const { id, a, b } = await setup();
    await Promise.all([a, b, a, b].map((template) => assignTemplate(id, template, K1)));
    expect(await prisma.templateAssignment.count()).toBe(1);
  });
});

describe('unassignTemplate', () => {
  it('frees the category, but not of another template', async () => {
    const { id, a, b, list } = await setup();
    await assignTemplate(id, a, K1);
    await unassignTemplate(id, b, K1);
    expect(await list()).toEqual({ A: ['K1 FEMALE'], B: [] });
    await unassignTemplate(id, a, K1);
    expect(await list()).toEqual({ A: [], B: [] });
  });
});

it('stays with the original when it is copied, and ends with its template', async () => {
  const { id, a, list } = await setup();
  await assignTemplate(id, a, K1);
  await duplicateRankingTemplate(id, a, 'Copy');
  expect(await list()).toEqual({ A: ['K1 FEMALE'], B: [], Copy: [] });
  await deleteRankingTemplate(id, a);
  expect(await list()).toEqual({ B: [], Copy: [] });
  expect(await prisma.templateAssignment.count()).toBe(0);
});

describe('groupByTemplate', () => {
  it('uses the default one for the rest', async () => {
    const { id, a, b } = await setup();
    await assignTemplate(id, b, K1);
    await assignTemplate(id, b, K1_MEN);
    // The default one may have categories of its own.
    await assignTemplate(id, a, { sex: 'FEMALE', category: 'K3' });
    const K3 = { sex: 'FEMALE', category: 'K3' } as const;
    expect(await groupByTemplate(id, [K1, K2, K3, K1_MEN])).toEqual([
      { templateId: b, groups: [K1, K1_MEN] },
      { templateId: a, groups: [K2, K3] },
    ]);
  });

  it('has no template without any', async () => {
    const { id } = await createCompetition();
    expect(await groupByTemplate(id, [K1])).toEqual([{ templateId: null, groups: [K1] }]);
  });
});
