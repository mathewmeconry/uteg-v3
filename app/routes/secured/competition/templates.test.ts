import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '~/generated/prisma/client';
import { rankingTemplateSchema } from '~/lib/domain/rankingTemplate';
import { createRankingTemplate, listRankingTemplates } from '~/lib/rankingTemplates.server';
import { createCompetition, createDivision, truncateTables } from '~/tests/helpers';
import { callRoute } from '~/tests/routes';
import { action, loader } from './templates';

beforeEach(truncateTables);

const OPTIONS = rankingTemplateSchema.parse({ title: 'Titel' });

function create(competitionId: string, name: string) {
  return createRankingTemplate(competitionId, { name, options: OPTIONS });
}

function post(
  competitionId: string,
  fields: Record<string, string>,
  { role = 'EDITOR', search = '' }: { role?: Role; search?: string } = {},
) {
  return callRoute(action, { competitionId, role, search, form: Object.entries(fields) });
}

const list = async (competitionId: string) =>
  (await listRankingTemplates(competitionId)).map(({ name, isDefault }) => [name, isDefault]);

describe('loader', () => {
  it('lists the templates and selects one', async () => {
    const { id, contest } = await createCompetition();
    await createDivision(contest.id, { state: 'ENDED' });
    await createDivision(contest.id, { category: 'K6', state: 'RUNNING' });
    const a = await create(id, 'A');
    const b = await create(id, 'B');
    const load = (search = '') => callRoute(loader, { competitionId: id, role: 'VIEWER', search });

    const result = await load();
    expect(result.templates).toMatchObject([
      { id: a.id, name: 'A', isDefault: true, options: { title: 'Titel' } },
      { id: b.id, name: 'B', isDefault: false },
    ]);
    expect(result.selected).toBe(a.id);
    expect(result.previewGroups).toEqual([
      { contestId: contest.id, contestName: 'EGT', sex: 'FEMALE', category: 'K5' },
    ]);
    expect((await load(`?template=${b.id}`)).selected).toBe(b.id);
    expect((await load('?template=new')).selected).toBe('new');
    expect((await load('?template=unknown')).selected).toBe(a.id);
  });

  it('is hidden from strangers', async () => {
    const { id } = await createCompetition();
    expect((await callRoute(loader, { competitionId: id })).status).toBe(404);
  });
});

describe('action', () => {
  it('creates and edits', async () => {
    const { id } = await createCompetition();
    const created = await post(id, {
      intent: 'save',
      name: ' Final ',
      options: JSON.stringify({ decimals: 3 }),
    });
    const [template] = await listRankingTemplates(id);
    expect(template).toMatchObject({ name: 'Final', isDefault: true, options: { decimals: 3 } });
    expect(created.headers.get('Location')).toBe(
      `/competitions/${id}/templates?template=${template.id}`,
    );

    await post(id, {
      intent: 'save',
      id: template.id,
      name: 'Neu',
      options: JSON.stringify({ decimals: 2 }),
    });
    expect(await listRankingTemplates(id)).toMatchObject([
      { name: 'Neu', options: { decimals: 2 } },
    ]);
  });

  it.each([
    [{ name: ' ', options: '{}' }, { name: 'Bitte ausfüllen' }],
    [{ name: 'A', options: '{"fontSize":99}' }, { 'options.fontSize': expect.any(String) }],
    [{ name: 'A', options: '{' }, { options: expect.any(String) }],
  ])('rejects %j', async (fields, errors) => {
    const { id } = await createCompetition();
    const result = await post(id, { intent: 'save', ...fields });
    expect(result.init.status).toBe(400);
    expect(result.data.errors).toMatchObject(errors);
    expect(await list(id)).toEqual([]);
  });

  it('duplicates, sets the default and deletes', async () => {
    const { id } = await createCompetition();
    const a = await create(id, 'A');
    await post(id, { intent: 'duplicate', id: a.id });
    expect(await list(id)).toEqual([
      ['A', true],
      ['A (Kopie)', false],
    ]);

    const [, copy] = await listRankingTemplates(id);
    expect(copy.options.title).toBe('Titel');
    await post(id, { intent: 'setDefault', id: copy.id });
    expect(await list(id)).toEqual([
      ['A', false],
      ['A (Kopie)', true],
    ]);

    const search = `?template=${a.id}`;
    const other = await post(id, { intent: 'delete', id: copy.id }, { search });
    expect(other.headers.get('Location')).toBe(`/competitions/${id}/templates${search}`);
    const shown = await post(id, { intent: 'delete', id: a.id }, { search });
    expect(shown.headers.get('Location')).toBe(`/competitions/${id}/templates`);
    expect(await list(id)).toEqual([]);
  });

  it('denies viewers and strangers', async () => {
    const { id } = await createCompetition();
    const { id: templateId } = await create(id, 'A');
    for (const intent of ['save', 'duplicate', 'setDefault', 'delete']) {
      const fields = { intent, id: templateId, name: 'X', options: '{}' };
      expect((await post(id, fields, { role: 'VIEWER' })).status).toBe(403);
      const stranger = await callRoute(action, {
        competitionId: id,
        form: Object.entries(fields),
      });
      expect(stranger.status).toBe(404);
    }
    expect(await list(id)).toEqual([['A', true]]);
  });

  it('answers templates of other competitions with 404', async () => {
    const { id } = await createCompetition();
    const other = await createCompetition();
    const { id: templateId } = await create(other.id, 'A');
    for (const intent of ['save', 'duplicate', 'setDefault', 'delete']) {
      const fields = { intent, id: templateId, name: 'X', options: '{}' };
      expect((await post(id, fields)).status).toBe(404);
    }
    expect(await list(other.id)).toEqual([['A', true]]);
    expect(await list(id)).toEqual([]);
  });
});
