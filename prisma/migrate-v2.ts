import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Prisma, Sex } from '~/generated/prisma/client';
import { cleanLogo } from '~/lib/assets.server';
import { starterSchema } from '~/lib/domain/starter';
import { DomainError } from '~/lib/errors';
import { prisma } from '~/lib/prisma.server';
import { egtModule, type EgtConfig } from '~/modules/egt/module';

/**
 * Copies the data of uteg-v2 into an empty database, all or nothing. Accounts get no password.
 * Judge and display links are left out, their old addresses would not work anyway.
 */

type Row = Record<string, string | null>;

// Index: the device number of v2.
const APPARATUS = ['reck', 'boden', 'schaukelringe', 'sprung', 'barren'] as const;
const OWNER_ROLE = '99';

const [dumpPath, storagePath] = process.argv.slice(2);

async function main() {
  if (!dumpPath) throw new Error('Usage: pnpm migrate:v2 <dump.sql> [<storage directory of v2>]');
  const read = createReader(await readFile(dumpPath, 'utf8'));
  const data = convert(read);
  const logos = await readLogos(read('competition'), data.competitionIds);

  await prisma.$transaction(
    async (tx) => {
      const filled =
        (await tx.competition.count()) + (await tx.athlete.count()) + (await tx.club.count());
      if (filled > 0) throw new Error('The database already has competitions, athletes or clubs');

      const members = await createUsers(tx, read('user'), read('user_link'), data.competitionIds);
      await tx.club.createMany({ data: data.clubs });
      await tx.competition.createMany({ data: data.competitions });
      await tx.member.createMany({ data: members });
      await tx.contest.createMany({ data: data.contests });
      await tx.athlete.createMany({ data: data.athletes });
      await tx.starter.createMany({ data: data.starters });
      await tx.division.createMany({ data: data.divisions });
      await tx.divisionApparatus.createMany({ data: data.divisionApparatus });
      await tx.entry.createMany({ data: data.entries });
      await tx.grade.createMany({ data: data.grades });
      for (const { competitionId, ...logo } of logos) {
        const asset = await tx.asset.create({ data: { competitionId, ...logo } });
        await tx.competition.update({ where: { id: competitionId }, data: { logoId: asset.id } });
      }
    },
    { timeout: 300_000 },
  );

  for (const table of [
    'user',
    'club',
    'competition',
    'member',
    'athlete',
    'starter',
    'division',
    'entry',
    'grade',
    'asset',
  ] as const) {
    const count = await (prisma[table] as { count(): Promise<number> }).count();
    print(`${table}: ${count}`);
  }
}

function convert(read: (table: string) => Row[]) {
  const v2Competitions = read('competition');
  const v2Starters = read('starter');
  const v2Divisions = read('egt_division');
  const v2Grades = read('grade');
  const settings = keyBy(read('egt_settings'), 'competitionId');
  const devices = read('egt_device');
  const deviceById = keyBy(devices, 'id');
  const lineups = keyBy(read('egt_lineup'), 'id');
  const divisionById = keyBy(v2Divisions, 'id');

  // ── Master data ────────────────────────────────────────────────────────────

  const clubIds = createIds(read('club'));
  const clubs = read('club').map((row) => ({
    id: get(clubIds, row.id),
    name: text(row.name),
    location: text(row.location),
  }));

  const athleteIds = createIds(v2Starters);
  const people = new Map(
    v2Starters.map((row) => {
      const person = starterSchema.parse({
        stvId: row.stvID,
        firstname: row.firstname,
        lastname: row.lastname,
        birthYear: toBirthYear(Number(row.birthyear)),
        sex: toSex(row.sex),
      });
      if (person.birthYear !== Number(row.birthyear)) {
        print(`Starter ${row.id}: birth year ${row.birthyear} is now ${person.birthYear}`);
      }
      return [row.id, person];
    }),
  );
  const athletes = v2Starters.map((row) => ({
    id: get(athleteIds, row.id),
    ...get(people, row.id),
  }));

  // ── Starters ───────────────────────────────────────────────────────────────

  const gradesByLink = Map.groupBy(v2Grades, (row) => row.starterlinkId);
  const countGrades = (link: Row) => gradesByLink.get(link.id)?.length ?? 0;
  const groups = Map.groupBy(
    read('starter_link'),
    (row) => `${row.competitionId} ${row.starterId}`,
  );
  // People could be in a v2 competition several times, e.g. removed and added again.
  const links = [...groups.values()].map((group) => {
    const [link, ...others] = group.toSorted(
      (a, b) =>
        Number(a.deletedAt !== null) - Number(b.deletedAt !== null) ||
        countGrades(b) - countGrades(a) ||
        Number(a.id) - Number(b.id),
    );
    for (const other of others) {
      if (countGrades(other) > 0) throw new Error(`Starter link ${other.id} has grades`);
      print(`Starter link ${other.id} is left out, the person is there as ${link.id}`);
    }
    return link;
  });
  links.sort((a, b) => Number(a.id) - Number(b.id));

  const competitionIds = createIds(v2Competitions);
  const starterIds = createIds(links);
  const starters = links.map((row) => {
    const { firstname, lastname, birthYear, sex } = get(people, row.starterId);
    return {
      id: get(starterIds, row.id),
      competitionId: get(competitionIds, row.competitionId),
      athleteId: get(athleteIds, row.starterId),
      clubId: get(clubIds, row.clubId),
      firstname,
      lastname,
      birthYear,
      sex,
      deletedAt: toDate(row.deletedAt),
    };
  });

  // ── Competitions ───────────────────────────────────────────────────────────

  const competitions = v2Competitions.map((row) => {
    if (row.modules !== 'egt') throw new Error(`Competition ${row.id} has modules ${row.modules}`);
    const id = get(competitionIds, row.id);
    const used = new Set<Sex>([
      ...starters.filter(({ competitionId }) => competitionId === id).map(({ sex }) => sex),
      ...v2Divisions
        .filter(({ competitionId }) => competitionId === row.id)
        .map(({ sex }) => toSex(sex)),
    ]);
    return {
      id,
      name: text(row.name),
      location: text(row.location),
      startDate: toSwissDay(row.startDate),
      endDate: toSwissDay(row.endDate),
      grounds: Number(row.grounds),
      sexes: used.size > 0 ? [...used].sort() : undefined,
    };
  });

  const contestIds = createIds(v2Competitions);
  const contests = v2Competitions.map((row) => ({
    id: get(contestIds, row.id),
    competitionId: get(competitionIds, row.id),
    module: egtModule.key,
    name: 'EGT',
    config: createConfig(
      settings.get(row.id)?.categorySettings ?? '[]',
      devices.filter(({ competitionId }) => competitionId === row.id),
    ),
  }));

  // ── Divisions and lineups ──────────────────────────────────────────────────

  const divisionIds = createIds(v2Divisions);
  const divisions = v2Divisions.map((row, index) => {
    const sex = toSex(row.sex);
    const state = row.state as 'PENDING' | 'RUNNING' | 'ENDED';
    // When the state last changed.
    const changedAt = toDate(row.lastStateTransition);
    return {
      id: get(divisionIds, row.id),
      contestId: get(contestIds, row.competitionId),
      category: toCategory(row.category, sex),
      sex,
      number: Number(row.number),
      ground: Number(row.ground),
      // In the order they were created. The gaps from other grounds don't matter.
      position: index + 1,
      state,
      startedAt: state === 'RUNNING' ? changedAt : null,
      endedAt: state === 'ENDED' ? changedAt : null,
    };
  });

  const divisionApparatus = v2Divisions.flatMap((row) => {
    const rounds = text(row.currentDeviceRound).split(',').map(Number);
    const apparatus = APPARATUS.slice(0, toSex(row.sex) === 'MALE' ? 5 : 4);
    return apparatus.map((key, device) => ({
      divisionId: get(divisionIds, row.id),
      apparatus: key,
      // v2 sometimes counted one round too many.
      completedRounds: Math.min(rounds[device], apparatus.length),
    }));
  });

  const linkById = keyBy(links, 'id');
  const positions = new Map<string, number>();
  const entryIdByLink = new Map<string | null, string>();
  const entries = read('egt_starter_link').flatMap((row) => {
    const link = linkById.get(row.starterLinkId);
    if (!link) return [];
    const { sex } = get(people, link.starterId);
    const division = row.divisionId === null ? null : get(divisionById, row.divisionId);
    // The lineup of a removed starter may belong to another division.
    const lineup = row.lineupId === null ? null : get(lineups, row.lineupId);
    const device =
      lineup && lineup.divisionId === row.divisionId
        ? Number(get(deviceById, lineup.deviceId).deviceNumber)
        : null;
    let position = 0;
    if (device !== null) {
      const key = text(row.lineupId);
      position = positions.get(key) ?? 0;
      positions.set(key, position + 1);
    }
    const id = createId();
    entryIdByLink.set(link.id, id);
    return {
      id,
      contestId: get(contestIds, link.competitionId),
      starterId: get(starterIds, link.id),
      category: row.category === null ? null : toCategory(row.category, sex),
      divisionId: division && get(divisionIds, division.id),
      startApparatus: device === null ? null : APPARATUS[device],
      position,
      withdrawnAt: toDate(row.deletedAt),
    };
  });

  // ── Grades ─────────────────────────────────────────────────────────────────

  const endDates = new Map(competitions.map(({ id, endDate }) => [id, endDate]));
  const now = new Date();
  const grades = v2Grades.map((row) => {
    const link = get(linkById, row.starterlinkId);
    // v2 did not store when a grade was entered, rankings show the newest date.
    const endDate = get(endDates, get(competitionIds, link.competitionId));
    const enteredAt = endDate < now ? endDate : now;
    return {
      id: createId(),
      entryId: get(entryIdByLink, link.id),
      apparatus: APPARATUS[Number(row.deviceNumber)],
      value: Math.round(Number(row.value) * 1000),
      attempts: [],
      createdAt: enteredAt,
      updatedAt: enteredAt,
    };
  });

  return {
    competitionIds,
    clubs,
    athletes,
    competitions,
    contests,
    starters,
    divisions,
    divisionApparatus,
    entries,
    grades,
  };
}

/**
 * v2 never verified addresses, so everyone has to reset the password, which verifies the address.
 * Accounts with a verified address stay as they are. Returns the members of the competitions.
 */
async function createUsers(
  tx: Prisma.TransactionClient,
  users: Row[],
  links: Row[],
  competitionIds: Map<string | null, string>,
) {
  const userIds = new Map<string | null, string>();
  for (const row of users) {
    const email = text(row.email).trim().toLowerCase();
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) print(`${email} has an account already, it gets the competitions of v2`);
    if (existing && !existing.emailVerified) {
      // Someone else may have signed up with it.
      await tx.account.deleteMany({ where: { userId: existing.id } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
    }
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      // v2 had no names.
      create: {
        id: randomUUID(),
        email,
        name: email.split('@')[0],
        language: text(row.language),
      },
    });
    userIds.set(row.id, user.id);
  }
  return links.map((row) => ({
    id: createId(),
    userId: get(userIds, row.userId),
    competitionId: get(competitionIds, row.competitionId),
    role: row.role === OWNER_ROLE ? ('OWNER' as const) : ('VIEWER' as const),
  }));
}

async function readLogos(competitions: Row[], competitionIds: Map<string | null, string>) {
  const logos = [];
  for (const { id, name, logoPath } of competitions) {
    if (!logoPath) continue;
    if (!storagePath) {
      print(`${name}: logo ${basename(logoPath)} is missing, no storage directory was given`);
      continue;
    }
    try {
      const logo = await cleanLogo(await readFile(join(storagePath, basename(logoPath))));
      logos.push({ competitionId: get(competitionIds, id), ...logo });
    } catch (error) {
      // Other formats such as SVG, or the file is gone.
      if (!(error instanceof DomainError) && (error as { code?: string }).code !== 'ENOENT') {
        throw error;
      }
      print(`${name}: logo ${basename(logoPath)} cannot be used (${(error as Error).message})`);
    }
  }
  return logos;
}

// ── Values ───────────────────────────────────────────────────────────────────

type CategorySetting = { category: number; sex: string; honourPrecentage: number };
type InputOverride = { category: number; inputs: number; aggregationMode: string };

function createConfig(categorySettings: string, devices: Row[]): EgtConfig {
  const config = structuredClone(egtModule.defaultConfig);
  for (const { category, sex, honourPrecentage } of JSON.parse(
    categorySettings,
  ) as CategorySetting[]) {
    // Category 0 never existed, it was only in the settings of the first competition.
    if (category === 0) continue;
    config.honourPercent[toSex(sex)][toCategory(String(category), toSex(sex))] = honourPrecentage;
  }
  config.inputs = {};
  for (const device of devices) {
    const overrides = JSON.parse(text(device.overrides)) as InputOverride[];
    if (device.inputs === '1' && overrides.length === 0) continue;
    config.inputs[APPARATUS[Number(device.deviceNumber)]] = {
      default: toInputRule(Number(device.inputs), text(device.aggregationMode)),
      categories: Object.fromEntries(
        overrides.flatMap(({ category, inputs, aggregationMode }) =>
          (['FEMALE', 'MALE'] as const).map((sex) => [
            toCategory(String(category), sex),
            toInputRule(inputs, aggregationMode),
          ]),
        ),
      ),
    };
  }
  return egtModule.configSchema.parse(config);
}

function toInputRule(attempts: number, mode: string) {
  return { attempts, aggregation: mode.toUpperCase() as 'NONE' | 'MAX' | 'MIN' | 'AVG' };
}

function toSex(sex: string | null): Sex {
  if (sex === 'female') return 'FEMALE';
  if (sex === 'male') return 'MALE';
  throw new Error(`Unknown sex ${sex}`);
}

function toCategory(category: string | null, sex: Sex) {
  if (category === '8') return sex === 'FEMALE' ? 'KD' : 'KH';
  const key = `K${category}`;
  if (!egtModule.categories(egtModule.defaultConfig, sex).includes(key)) {
    throw new Error(`Unknown category ${category}`);
  }
  return key;
}

/** Some were imported from Excel as a date, which is a number of days. */
function toBirthYear(value: number) {
  return value > 9999 ? new Date(Date.UTC(1899, 11, 30 + value)).getUTCFullYear() : value;
}

/** The dump has UTC. */
function toDate(value: string | null) {
  return value === null ? null : new Date(`${value.replace(' ', 'T')}Z`);
}

/** v2 stored midnight in Switzerland, so the day in UTC is often the one before. */
function toSwissDay(value: string | null) {
  const date = new Date(`${text(value).replace(' ', 'T')}Z`);
  return new Date(date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' }));
}

// ── Dump ─────────────────────────────────────────────────────────────────────

/** Reads the rows of a table, ordered by id. Expects one INSERT per table as mariadb-dump writes. */
function createReader(dump: string) {
  const tables = new Map<string, Row[]>();
  for (const [, table, definition] of dump.matchAll(/^CREATE TABLE `(\w+)` \(\n([^]*?)\n\)/gm)) {
    const columns = [...definition.matchAll(/^ {2}`(\w+)`/gm)].map(([, column]) => column);
    const rows = readRows(dump, table).map((values) => {
      if (values.length !== columns.length) throw new Error(`Cannot read a row of ${table}`);
      return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    });
    rows.sort((a, b) => Number(a.id) - Number(b.id));
    tables.set(table, rows);
  }
  return (table: string) => {
    const rows = tables.get(table);
    if (!rows) throw new Error(`The dump has no table ${table}`);
    return rows;
  };
}

function readRows(dump: string, table: string) {
  const rows: (string | null)[][] = [];
  const insert = new RegExp(`^INSERT INTO \`${table}\` VALUES\\s*`, 'gm');
  while (insert.exec(dump)) {
    const token = /\s*(?:([(),;])|(NULL)|(-?[\d.]+)|'((?:[^'\\]|\\[^]|'')*)')/y;
    token.lastIndex = insert.lastIndex;
    let row: (string | null)[] = [];
    for (;;) {
      const match = token.exec(dump);
      if (!match) throw new Error(`Cannot read the rows of ${table}`);
      const [, sign, isNull, number, string] = match;
      if (sign === ';') break;
      if (sign === '(') row = [];
      else if (sign === ')') rows.push(row);
      else if (!sign) row.push(isNull ? null : (number ?? unescape(string)));
    }
  }
  return rows;
}

const ESCAPES: Partial<Record<string, string>> = { n: '\n', r: '\r', t: '\t', 0: '\0' };

function unescape(value: string) {
  return value.replace(/\\([^])|''/g, (_, char?: string) =>
    char === undefined ? "'" : (ESCAPES[char] ?? char),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const startedAt = Date.now();
let idCount = 0;

/** A ULID. They keep the order of v2, which is the one of lists sorted by id. */
function createId() {
  return encode(startedAt, 10) + encode(idCount++, 16);
}

function encode(value: number, length: number) {
  let result = '';
  for (let rest = value; result.length < length; rest = Math.floor(rest / 32)) {
    result = ID_ALPHABET[rest % 32] + result;
  }
  return result;
}

function createIds(rows: Row[]) {
  return new Map(rows.map(({ id }) => [id, createId()]));
}

function keyBy(rows: Row[], column: string) {
  return new Map(rows.map((row) => [row[column], row]));
}

function get<Value>(map: Map<string | null, Value>, key: string | null) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Broken reference ${key}`);
  return value;
}

function text(value: string | null) {
  if (value === null) throw new Error('Unexpected NULL');
  return value;
}

function print(message: string) {
  process.stdout.write(`${message}\n`);
}

await main().finally(() => prisma.$disconnect());
