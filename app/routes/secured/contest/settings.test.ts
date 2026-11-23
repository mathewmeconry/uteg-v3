import type { Role } from '~/generated/prisma/client';
import { prisma } from '~/lib/prisma.server';
import { egtModule } from '~/modules/egt/module';
import { callRoute } from '~/tests/competitionRoutes';
import {
  addMember,
  createCompetition,
  createStarter,
  createUser,
  truncateTables,
} from '~/tests/helpers';
import { action, loader } from './settings';

const config = JSON.stringify({ ...egtModule.defaultConfig, precision: 3 });

beforeEach(truncateTables);

async function setup(role: Role = 'EDITOR') {
  const competition = await createCompetition();
  const { id: userId } = await createUser();
  await addMember(competition.id, userId, role);
  const call = { userId, competitionId: competition.id, contestId: competition.contest.id };
  return {
    competition,
    load: () => callRoute(loader, call),
    post: async (form: Record<string, string>, ids = {}) => {
      const version = (await callRoute(loader, call)).data.version;
      return callRoute(action, { ...call, ...ids, form: { version, ...form } });
    },
    precision: async () => {
      const contest = await prisma.contest.findUniqueOrThrow({ where: { id: call.contestId } });
      return (contest.config as { precision: number }).precision;
    },
  };
}

describe('contest settings', () => {
  it('loads the config', async () => {
    const { load } = await setup('VIEWER');
    expect((await load()).data).toMatchObject({ module: 'egt', config: egtModule.defaultConfig });
  });

  it('saves the config', async () => {
    const { post, precision } = await setup();
    const result = await post({ config });
    expect(result).toMatchObject({ status: 302, toasts: [{ type: 'success' }] });
    expect(await precision()).toBe(3);
  });

  it('explains that a vault rule with grades cannot change', async () => {
    const { competition, post } = await setup();
    const { entry } = await createStarter(competition.id);
    await prisma.grade.create({
      data: { entryId: entry.id, apparatus: 'sprung', value: 9000, attempts: [8000, 9000] },
    });
    const inputs = {
      sprung: { default: { attempts: 2, aggregation: 'AVG' }, categories: {} },
    };
    const result = await post({ config: JSON.stringify({ ...egtModule.defaultConfig, inputs }) });
    expect(result.status).toBe(400);
    expect(result.data.error).toContain('Sprung');
  });

  it.each(['', '{', '{"precision":7}', 'null'])('rejects the config %j', async (text) => {
    const { post, precision } = await setup();
    expect((await post({ config: text })).status).toBe(400);
    expect(await precision()).toBe(2);
  });

  it('refuses changes made on an older version', async () => {
    const { load, post, precision } = await setup();
    const { version } = (await load()).data;
    await post({ config });
    const late = await post({ config: JSON.stringify(egtModule.defaultConfig), version });
    expect(late.status).toBe(400);
    expect(late.data.error).toContain('geändert');
    expect(await precision()).toBe(3);
  });

  it('denies a VIEWER', async () => {
    const { post, precision } = await setup('VIEWER');
    expect((await post({ config })).status).toBe(403);
    expect(await precision()).toBe(2);
  });

  it('hides other competitions and their contests', async () => {
    const { post } = await setup();
    const other = await createCompetition();
    const ids = { contestId: other.contest.id };
    expect((await post({ config }, ids)).status).toBe(404);
    expect((await post({ config }, { ...ids, competitionId: other.id })).status).toBe(404);
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: other.contest.id } });
    expect(contest.config).toMatchObject({ precision: 2 });
  });
});
