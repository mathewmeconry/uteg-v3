import type { listStarters } from '~/lib/starters.server';

type Starter = Awaited<ReturnType<typeof listStarters>>[number];

/** A starter with its entry in one contest, as shown on the starters page. */
export type StarterRow = ReturnType<typeof toStarterRow>;

export function toStarterRow(starter: Starter, contestId: string) {
  const { id, firstname, lastname, birthYear, sex, athleteId, athlete, club } = starter;
  const entry = starter.entries.find((candidate) => candidate.contestId === contestId);
  return {
    id,
    firstname,
    lastname,
    birthYear,
    sex,
    club: { id: club.id, name: club.name, location: club.location },
    stvId: athlete.stvId,
    athleteId,
    /** The master data, see differs. */
    athlete: {
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      birthYear: athlete.birthYear,
      sex: athlete.sex,
    },
    differs: starter.differsFromAthlete,
    entryId: entry?.id ?? null,
    category: entry?.category ?? null,
    divisionId: entry?.divisionId ?? null,
    divisionNumber: entry?.division?.number ?? null,
    startApparatus: entry?.startApparatus ?? null,
  };
}

export function fullName({ firstname, lastname }: { firstname: string; lastname: string }) {
  return `${firstname} ${lastname}`;
}
