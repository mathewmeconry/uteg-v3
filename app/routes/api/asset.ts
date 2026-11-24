import type { Route } from './+types/asset';
import { userContext } from '~/context';
import { hasAccessToCompetition } from '~/lib/access.server';
import { prisma } from '~/lib/prisma.server';
import { isAdmin } from '~/lib/users.server';

/** An uploaded image, for members, judges and displays. */
export async function loader({ request, params: { assetId }, context }: Route.LoaderArgs) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { competitionId: true },
  });
  if (
    !asset ||
    !(
      (await isMember(context.get(userContext)?.id, asset.competitionId)) ||
      (await hasAccessToCompetition(request, asset.competitionId))
    )
  ) {
    throw new Response(null, { status: 404 });
  }

  const { data, mimeType } = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  return new Response(data, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      // A new upload gets a new id.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

async function isMember(userId: string | undefined, competitionId: string) {
  if (!userId) return false;
  return (
    (await isAdmin(userId)) || (await prisma.member.count({ where: { userId, competitionId } })) > 0
  );
}
