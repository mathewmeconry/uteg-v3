import type { Route } from './+types/scanImage';
import { competitionContext } from '~/context';
import { getScanImage } from '~/lib/scans.server';

/** The handwriting a scanned grade was read from. */
export async function loader({ context, params: { scanId } }: Route.LoaderArgs) {
  const { id } = context.get(competitionContext);
  const image = await getScanImage(id, scanId);
  if (!image) throw new Response(null, { status: 404 });
  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      // Scanning again gives a new id.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
