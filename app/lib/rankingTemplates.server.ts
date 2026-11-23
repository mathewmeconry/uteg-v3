import { z } from 'zod';
import type { Prisma } from '~/generated/prisma/client';
import {
  defaultRankingTemplate,
  parseStoredTemplate,
  rankingTemplateSchema,
} from './domain/rankingTemplate';
import { DomainError } from './errors';
import { publish } from './events.server';
import { lockCompetition } from './locks.server';
import { prisma } from './prisma.server';

const inputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  options: rankingTemplateSchema,
});

type TemplateInput = z.input<typeof inputSchema>;

export async function listRankingTemplates(competitionId: string) {
  const templates = await prisma.rankingTemplate.findMany({
    where: { competitionId },
    orderBy: { name: 'asc' },
  });
  return templates.map((template) => ({
    ...template,
    options: parseStoredTemplate(template.options),
  }));
}

/** The template, or the default one. Without any the built-in look. */
export async function getRankingTemplate(competitionId: string, templateId: string | null) {
  const template = await prisma.rankingTemplate.findFirst({
    where: { competitionId, ...(templateId ? { id: templateId } : { isDefault: true }) },
    include: { cover: true },
  });
  if (templateId && !template) throw new DomainError('NOT_FOUND');
  return {
    options: template ? parseStoredTemplate(template.options) : defaultRankingTemplate,
    cover: template?.cover?.data ?? null,
  };
}

/** A copy with its own cover. */
export async function duplicateRankingTemplate(
  competitionId: string,
  templateId: string,
  name: string,
) {
  const { options, cover } = await getRankingTemplate(competitionId, templateId);
  const input = parseInput({ name, options });
  await prisma.rankingTemplate.create({
    data: {
      ...input,
      competition: { connect: { id: competitionId } },
      cover: cover
        ? { create: { competitionId, mimeType: 'application/pdf', data: cover } }
        : undefined,
    },
  });
  publish(competitionId, 'settings');
}

export async function createRankingTemplate(competitionId: string, input: TemplateInput) {
  const data = parseInput(input);
  const template = await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const count = await tx.rankingTemplate.count({ where: { competitionId } });
    return tx.rankingTemplate.create({ data: { ...data, competitionId, isDefault: count === 0 } });
  });
  publish(competitionId, 'settings');
  return template;
}

export async function updateRankingTemplate(
  competitionId: string,
  templateId: string,
  input: TemplateInput,
) {
  const { count } = await prisma.rankingTemplate.updateMany({
    where: { id: templateId, competitionId },
    data: parseInput(input),
  });
  if (count === 0) throw new DomainError('NOT_FOUND');
  publish(competitionId, 'settings');
}

export async function setDefaultRankingTemplate(competitionId: string, templateId: string) {
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    await getTemplate(tx, competitionId, templateId);
    await tx.rankingTemplate.updateMany({ where: { competitionId }, data: { isDefault: false } });
    await tx.rankingTemplate.update({ where: { id: templateId }, data: { isDefault: true } });
  });
  publish(competitionId, 'settings');
}

export async function deleteRankingTemplate(competitionId: string, templateId: string) {
  await prisma.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    const { isDefault, coverId } = await getTemplate(tx, competitionId, templateId);
    await tx.rankingTemplate.delete({ where: { id: templateId } });
    if (coverId) await tx.asset.delete({ where: { id: coverId }, select: { id: true } });
    const next = await tx.rankingTemplate.findFirst({
      where: { competitionId },
      orderBy: { id: 'asc' },
    });
    if (isDefault && next) {
      await tx.rankingTemplate.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  publish(competitionId, 'settings');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseInput(input: TemplateInput) {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT');
  return result.data;
}

async function getTemplate(
  tx: Prisma.TransactionClient,
  competitionId: string,
  templateId: string,
) {
  const template = await tx.rankingTemplate.findFirst({ where: { id: templateId, competitionId } });
  if (!template) throw new DomainError('NOT_FOUND');
  return template;
}
