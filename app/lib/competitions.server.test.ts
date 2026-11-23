import {
  addMember as addTestMember,
  createClub,
  createCompetition as createTestCompetition,
  createDivision,
  createStarter,
  createUser,
  errorCode,
  truncateTables,
} from '~/tests/helpers';
import { egtModule } from '~/modules/egt/module';
import {
  addMember,
  changeMemberRole,
  createCompetition,
  deleteCompetition,
  findUnknownEmails,
  getCompetitionForUser,
  getStats,
  listCompetitions,
  listMembers,
  removeMember,
  updateCompetition,
} from './competitions.server';
import { getOrCreateJudgeLinks, createDisplay } from './access.server';
import { createDivision as addDivision } from './divisions.server';
import { subscribe } from './events.server';
import { prisma } from './prisma.server';
import { createStarter as addStarter } from './starters.server';

const INPUT = {
  name: ' Gerätecup ',
  location: 'Zürich',
  startDate: new Date('2026-05-01'),
  endDate: new Date('2026-05-02'),
  grounds: 2,
};

beforeEach(truncateTables);

describe('createCompetition', () => {
  it('makes the user owner and creates the contests with their default config', async () => {
    const user = await createUser();
    const competition = await createCompetition(user.id, {
      ...INPUT,
      contests: [{ module: 'egt' }],
    });

    expect(competition).toMatchObject({ name: 'Gerätecup', grounds: 2 });
    expect(await listMembers(competition.id)).toMatchObject([{ userId: user.id, role: 'OWNER' }]);
    const contests = await prisma.contest.findMany();
    expect(contests).toMatchObject([{ module: 'egt', config: egtModule.defaultConfig }]);
  });

  it('takes a config and members', async () => {
    const user = await createUser();
    const editor = await createUser({ email: 'editor@example.com' });
    const config = { ...egtModule.defaultConfig, honourRounding: 'ceil' };
    const competition = await createCompetition(user.id, {
      ...INPUT,
      contests: [{ module: 'egt', config }],
      members: [{ email: ' Editor@Example.com', role: 'EDITOR' }],
    });
    expect(await listMembers(competition.id)).toMatchObject([
      { userId: user.id, role: 'OWNER' },
      { userId: editor.id, role: 'EDITOR' },
    ]);
    expect(await prisma.contest.findFirst()).toMatchObject({ config: { honourRounding: 'ceil' } });
  });

  it.each([
    ['name', { name: ' ' }, 'INVALID_INPUT'],
    ['dates', { endDate: new Date('2026-04-01') }, 'INVALID_INPUT'],
    ['grounds', { grounds: 0 }, 'INVALID_INPUT'],
    ['config', { contests: [{ module: 'egt', config: {} }] }, 'INVALID_CONFIG'],
    ['module', { contests: [{ module: 'nope' }] }, 'INVALID_CONFIG'],
    ['contests', { contests: [] }, 'INVALID_INPUT'],
    ['member', { members: [{ email: 'a@b.ch', role: 'EDITOR' }] }, 'USER_NOT_FOUND'],
  ] as const)('rejects an invalid %s and creates nothing', async (_, data, code) => {
    const user = await createUser();
    const input = { ...INPUT, contests: [{ module: 'egt' }], ...data } as any;
    expect(await errorCode(createCompetition(user.id, input))).toBe(code);
    expect(await prisma.competition.count()).toBe(0);
  });
});

describe('findUnknownEmails', () => {
  it('returns the addresses without an account', async () => {
    await createUser({ email: 'a@example.com' });
    expect(await findUnknownEmails([' A@example.com', 'b@example.com'])).toEqual(['b@example.com']);
  });
});

describe('getCompetitionForUser and listCompetitions', () => {
  it('returns the competition with the role to members only', async () => {
    const competition = await createTestCompetition();
    const viewer = await createUser();
    const stranger = await createUser();
    await addTestMember(competition.id, viewer.id, 'VIEWER');

    expect(await getCompetitionForUser(viewer.id, competition.id)).toMatchObject({
      id: competition.id,
      role: 'VIEWER',
      contests: [{ id: competition.contest.id }],
    });
    expect(await errorCode(getCompetitionForUser(stranger.id, competition.id))).toBe('NOT_FOUND');
    expect(await errorCode(getCompetitionForUser(viewer.id, 'nope'))).toBe('NOT_FOUND');
    expect(await listCompetitions(viewer.id)).toMatchObject([
      { id: competition.id, role: 'VIEWER' },
    ]);
    expect(await listCompetitions(stranger.id)).toEqual([]);
  });

  it.each([
    ['VIEWER', 'VIEWER', null],
    ['VIEWER', 'EDITOR', 'FORBIDDEN'],
    ['EDITOR', 'EDITOR', null],
    ['EDITOR', 'OWNER', 'FORBIDDEN'],
    ['OWNER', 'OWNER', null],
  ] as const)('a %s asking for %s gets %s', async (role, minRole, code) => {
    const competition = await createTestCompetition();
    const user = await createUser();
    await addTestMember(competition.id, user.id, role);
    expect(await errorCode(getCompetitionForUser(user.id, competition.id, minRole))).toBe(code);
  });
});

describe('a competition of one sex', () => {
  it('only has its apparatus, in its order', async () => {
    const { id } = await createTestCompetition();
    await updateCompetition(id, { ...INPUT, grounds: 1, sexes: ['FEMALE'] });
    const keys = async () => (await getOrCreateJudgeLinks(id)).map(({ apparatus }) => apparatus);
    expect(await keys()).toEqual(['reck', 'boden', 'schaukelringe', 'sprung']);
    await updateCompetition(id, { ...INPUT, grounds: 1, sexes: ['MALE'] });
    expect(await keys()).toEqual(['boden', 'schaukelringe', 'sprung', 'barren', 'reck']);
  });

  it('takes no starters and divisions of the other one', async () => {
    const { id, contest } = await createTestCompetition();
    await updateCompetition(id, { ...INPUT, sexes: ['FEMALE'] });
    const division = { category: 'K5', sex: 'MALE', ground: 1 } as const;
    expect(await errorCode(addDivision(id, contest.id, division))).toBe('SEX_NOT_ALLOWED');
    const club = await createClub();
    const person = { firstname: 'Noah', lastname: 'Frei', birthYear: 2010 };
    const add = (sex: 'FEMALE' | 'MALE') => addStarter(id, { ...person, sex, clubId: club.id });
    expect(await errorCode(add('MALE'))).toBe('SEX_NOT_ALLOWED');
    await add('FEMALE');
  });

  it('cannot leave out someone who takes part', async () => {
    const { id, contest } = await createTestCompetition();
    await createDivision(contest.id, { sex: 'MALE' });
    const update = (sexes: ('FEMALE' | 'MALE')[]) => updateCompetition(id, { ...INPUT, sexes });
    expect(await errorCode(update(['FEMALE']))).toBe('SEX_IN_USE');
    expect(await errorCode(update([]))).toBe('INVALID_INPUT');
    await update(['MALE']);
    // Without a choice it stays.
    await updateCompetition(id, INPUT);
    expect(await prisma.competition.findUnique({ where: { id } })).toMatchObject({
      sexes: ['MALE'],
    });
  });
});

describe('updateCompetition', () => {
  it('saves name, location, dates and grounds and tells the viewers', async () => {
    const { id } = await createTestCompetition();
    const listener = vi.fn();
    const stop = subscribe(id, listener);
    await updateCompetition(id, { ...INPUT, name: 'Neu', startDate: new Date('2026-04-30') });
    stop();
    expect(await prisma.competition.findUnique({ where: { id } })).toMatchObject({
      name: 'Neu',
      grounds: 2,
      startDate: new Date('2026-04-30'),
    });
    expect(listener).toHaveBeenCalledWith('settings');
  });

  it('does not remove a ground with a division', async () => {
    const competition = await createTestCompetition({ grounds: 2 });
    await createDivision(competition.contest.id, { ground: 2 });
    const update = updateCompetition(competition.id, { ...INPUT, grounds: 1 });
    expect(await errorCode(update)).toBe('GROUND_IN_USE');
  });

  it('does not remove a ground with a display', async () => {
    const competition = await createTestCompetition({ grounds: 2 });
    await createDisplay(competition.id, 2);
    const update = updateCompetition(competition.id, { ...INPUT, grounds: 1 });
    expect(await errorCode(update)).toBe('GROUND_IN_USE');
  });

  it('drops the generated judge links of a removed ground', async () => {
    const competition = await createTestCompetition({ grounds: 2 });
    await getOrCreateJudgeLinks(competition.id);
    await updateCompetition(competition.id, { ...INPUT, grounds: 1 });
    const links = await prisma.accessLink.findMany();
    expect(new Set(links.map(({ ground }) => ground))).toEqual(new Set([1]));
  });
});

describe('deleteCompetition', () => {
  it('deletes everything of the competition, but keeps clubs, athletes and others', async () => {
    const competition = await createTestCompetition();
    const other = await createTestCompetition();
    await createStarter(competition.id, { grades: { reck: 9000 } });
    const kept = await createStarter(other.id);
    await deleteCompetition(competition.id);
    expect(await prisma.competition.findMany()).toMatchObject([{ id: other.id }]);
    expect(await prisma.starter.findMany()).toMatchObject([{ id: kept.id }]);
    expect(await prisma.grade.count()).toBe(0);
    expect(await prisma.athlete.count()).toBe(2);
  });
});

describe('getStats', () => {
  it('counts active starters, their clubs, grades and divisions by state', async () => {
    const competition = await createTestCompetition();
    const club = await createClub();
    await createStarter(competition.id, { clubId: club.id, grades: { reck: 1, boden: 2 } });
    await createStarter(competition.id, { clubId: club.id });
    const removed = await createStarter(competition.id);
    await prisma.starter.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    await createDivision(competition.contest.id, { state: 'RUNNING' });
    await createStarter((await createTestCompetition()).id, { grades: { reck: 1 } });

    expect(await getStats(competition.id)).toEqual({
      starters: 2,
      clubs: 1,
      grades: 2,
      divisions: { PENDING: 0, RUNNING: 1, ENDED: 0 },
    });
  });
});

describe('members', () => {
  it('adds by email', async () => {
    const competition = await createTestCompetition();
    const user = await createUser({ email: 'a@example.com' });
    await addMember(competition.id, { email: 'A@example.com ', role: 'VIEWER' });
    expect(await listMembers(competition.id)).toMatchObject([
      { role: 'OWNER' },
      { userId: user.id, role: 'VIEWER', user: { email: 'a@example.com' } },
    ]);
    const again = addMember(competition.id, { email: 'a@example.com', role: 'EDITOR' });
    expect(await errorCode(again)).toBe('ALREADY_MEMBER');
    const unknown = addMember(competition.id, { email: 'b@example.com', role: 'EDITOR' });
    expect(await errorCode(unknown)).toBe('USER_NOT_FOUND');
  });

  it('never loses the last owner', async () => {
    const competition = await createTestCompetition();
    const { ownerId } = competition;
    expect(await errorCode(removeMember(competition.id, ownerId))).toBe('LAST_OWNER');
    expect(await errorCode(changeMemberRole(competition.id, ownerId, 'EDITOR'))).toBe('LAST_OWNER');
    await changeMemberRole(competition.id, ownerId, 'OWNER');
  });

  it('keeps one owner when two owners leave at the same time', async () => {
    const competition = await createTestCompetition();
    const second = await createUser();
    await addTestMember(competition.id, second.id, 'OWNER');
    await Promise.allSettled([
      removeMember(competition.id, competition.ownerId),
      removeMember(competition.id, second.id),
    ]);
    expect(await listMembers(competition.id)).toMatchObject([{ role: 'OWNER' }]);
  });

  it('changes roles and removes members', async () => {
    const competition = await createTestCompetition();
    const user = await createUser();
    await addTestMember(competition.id, user.id, 'VIEWER');
    await changeMemberRole(competition.id, user.id, 'OWNER');
    await removeMember(competition.id, competition.ownerId);
    expect(await listMembers(competition.id)).toMatchObject([{ userId: user.id, role: 'OWNER' }]);
    expect(await errorCode(removeMember(competition.id, 'nope'))).toBe('NOT_FOUND');
  });

  it('does not touch members of other competitions', async () => {
    const competition = await createTestCompetition();
    const other = await createTestCompetition();
    const user = await createUser();
    await addTestMember(other.id, user.id, 'VIEWER');
    expect(await errorCode(removeMember(competition.id, user.id))).toBe('NOT_FOUND');
    expect(await errorCode(changeMemberRole(competition.id, user.id, 'OWNER'))).toBe('NOT_FOUND');
  });
});
