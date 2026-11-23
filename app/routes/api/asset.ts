import type { Route } from './+types/asset';
import { userContext } from '~/context';
import { resolveToken } from '~/lib/access.server';
import { prisma } from '~/lib/prisma.server';

/** An uploaded image, for members and, with `?token=`, for judges and displays. */
export async function loader({ request, params: { assetId }, context }: Route.LoaderArgs) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { competitionId: true },
  });
  const token = new URL(request.url).searchParams.get('token');
  if (
    !asset ||
    !(
      (await isMember(context.get(userContext)?.id, asset.competitionId)) ||
      (await hasLink(token, asset.competitionId))
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
  return (await prisma.member.count({ where: { userId, competitionId } })) > 0;
}

async function hasLink(token: string | null, competitionId: string) {
  const link = (await resolveToken(token, 'JUDGE')) ?? (await resolveToken(token, 'DISPLAY'));
  return link?.competitionId === competitionId;
}
