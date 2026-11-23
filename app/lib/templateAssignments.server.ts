import type { Sex } from '~/generated/prisma/client';
import { getContestModule } from '~/modules/registry';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

/** The categories of all contests, by sex and in the order of their modules. */
export function getCompetitionCategories(contests: readonly { module: string; config: unknown }[]) {
  const modules = contests.map(getContestModule);
  const categories = (sex: Sex) => [
    ...new Set(modules.flatMap((module) => module.categories(sex))),
  ];
  return { FEMALE: categories('FEMALE'), MALE: categories('MALE') };
}

/**
 * Prints a category with a template from now on. Returns the name of the template it had before,
 * null if there was no other.
 */
export async function assignTemplate(
  competitionId: string,
  templateId: string,
  { sex, category }: { sex: Sex; category: string },
) {
  const previous = await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const template = await tx.rankingTemplate.findFirst({
      where: { id: templateId, competitionId },
      include: { competition: { include: { contests: true } } },
    });
    if (!template) throw new DomainError('NOT_FOUND');
    if (!getCompetitionCategories(template.competition.contests)[sex].includes(category)) {
      throw new DomainError('INVALID_CATEGORY');
    }
    const key = { competitionId, sex, category };
    const before = await tx.templateAssignment.findUnique({
      where: { competitionId_sex_category: key },
      include: { template: true },
    });
    await tx.templateAssignment.upsert({
      where: { competitionId_sex_category: key },
      create: { ...key, templateId },
      update: { templateId },
    });
    return before && before.templateId !== templateId ? before.template.name : null;
  });
  publish(competitionId, 'settings');
  return previous;
}

/** Only if the template still has it, someone else may have moved it. */
export async function unassignTemplate(
  competitionId: string,
  templateId: string,
  { sex, category }: { sex: Sex; category: string },
) {
  await prisma.templateAssignment.deleteMany({
    where: { competitionId, templateId, sex, category },
  });
  publish(competitionId, 'settings');
}

/**
 * The groups with the id of their template or the default one. Keeps their order, so a template may
 * come several times. Null without templates.
 */
export async function groupByTemplate<Group extends { sex: Sex; category: string }>(
  competitionId: string,
  groups: readonly Group[],
) {
  const [assignments, fallback] = await Promise.all([
    prisma.templateAssignment.findMany({ where: { competitionId } }),
    prisma.rankingTemplate.findFirst({ where: { competitionId, isDefault: true } }),
  ]);
  const find = ({ sex, category }: Group) =>
    assignments.find((item) => item.sex === sex && item.category === category)?.templateId ??
    fallback?.id ??
    null;
  const parts: { templateId: string | null; groups: Group[] }[] = [];
  for (const group of groups) {
    const templateId = find(group);
    const last = parts.at(-1);
    if (last?.templateId === templateId) last.groups.push(group);
    else parts.push({ templateId, groups: [group] });
  }
  return parts;
}
