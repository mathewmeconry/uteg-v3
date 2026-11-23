import { logger } from '~/lib/logger.server';
import { prisma } from '~/lib/prisma.server';

export async function loader() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' }, { headers });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    return Response.json({ status: 'error' }, { status: 503, headers });
  }
}
