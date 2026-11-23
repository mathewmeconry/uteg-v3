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
    post: (form: Record<string, string>, ids = {}) => callRoute(action, { ...call, ...ids, form }),
    precision: async () => {
      const contest = await prisma.contest.findUniqueOrThrow({ where: { id: call.contestId } });
      return (contest.config as { precision: number }).precision;
    },
  };
}

function addVault(entryId: string) {
  return prisma.grade.create({
    data: { entryId, apparatus: 'sprung', value: 9000, attempts: [8000, 9000] },
  });
}

describe('contest settings', () => {
  it('loads the config and how many grades depend on it', async () => {
    const { competition, load } = await setup('VIEWER');
    const { entry } = await createStarter(competition.id);
    await addVault(entry.id);
    expect((await load()).data).toMatchObject({
      module: 'egt',
      config: egtModule.defaultConfig,
      attemptGrades: [{ apparatus: 'sprung', category: 'K5', attempts: 2, count: 1 }],
    });
  });

  it('saves the config', async () => {
    const { post, precision } = await setup();
    const result = await post({ config });
    expect(result).toMatchObject({ status: 302, toasts: [{ type: 'success' }] });
    expect(await precision()).toBe(3);
  });

  it('recomputes grades and says how many', async () => {
    const { competition, post } = await setup();
    const { entry } = await createStarter(competition.id);
    const { id } = await addVault(entry.id);
    const inputs = {
      sprung: { default: { attempts: 2, aggregation: 'AVG' }, categories: {} },
    };
    const { toasts } = await post({
      config: JSON.stringify({ ...egtModule.defaultConfig, inputs }),
    });
    expect((await prisma.grade.findUnique({ where: { id } }))?.value).toBe(8500);
    expect(toasts[0].message).toContain('1');
  });

  it.each(['', '{', '{"precision":7}', 'null'])('rejects the config %j', async (text) => {
    const { post, precision } = await setup();
    expect((await post({ config: text })).status).toBe(400);
    expect(await precision()).toBe(2);
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
