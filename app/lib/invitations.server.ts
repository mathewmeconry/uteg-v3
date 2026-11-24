import type { Language } from '~/locales';
import { normalizeEmail, type MemberInput } from './competitions.server';
import { publish } from './events.server';
import { sendMail } from './mail.server';
import { APP_URL, createMail } from './mailTemplate.server';
import { prisma } from './prisma.server';
import { createRateLimit } from './rateLimit.server';

/** Per user. Anyone can create a competition, so this could send mails to strangers. */
export const mayInvite = createRateLimit({ windowMs: 60 * 60_000, max: 30 });

/** Addresses without an account that become members once they have one. */
export function listInvitations(competitionId: string) {
  return prisma.invitation.findMany({
    where: { competitionId },
    select: { id: true, email: true, role: true },
    orderBy: { id: 'asc' },
  });
}

/** Inviting an address again sets the role and sends another mail. Fails if it cannot be sent. */
export async function inviteMember(
  competition: { id: string; name: string },
  input: MemberInput,
  inviter: { email: string; language: Language },
) {
  const email = normalizeEmail(input.email);
  await prisma.invitation.upsert({
    where: { competitionId_email: { competitionId: competition.id, email } },
    create: { competitionId: competition.id, email, role: input.role },
    update: { role: input.role },
  });
  publish(competition.id, 'settings');

  const mail = await createMail('invitation', inviter.language, {
    competition: competition.name,
    inviter: inviter.email,
    email,
    url: `${APP_URL}/register`,
  });
  await sendMail({ to: email, ...mail });
}

export async function removeInvitation(competitionId: string, id: string) {
  await prisma.invitation.deleteMany({ where: { id, competitionId } });
  publish(competitionId, 'settings');
}

/** Only for verified addresses: anyone can register with the address of somebody else. */
export async function acceptInvitations(user: { id: string; email: string }) {
  const invitations = await prisma.$transaction(async (tx) => {
    const invitations = await tx.invitation.findMany({ where: { email: user.email } });
    await tx.member.createMany({
      data: invitations.map(({ competitionId, role }) => ({
        competitionId,
        role,
        userId: user.id,
      })),
      skipDuplicates: true,
    });
    await tx.invitation.deleteMany({ where: { id: { in: invitations.map(({ id }) => id) } } });
    return invitations;
  });
  for (const { competitionId } of invitations) publish(competitionId, 'settings');
}
