import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '~/server/prisma';
import { logger } from '~/server/logger';

/**
 * GET /api/health        → liveness: the Node process is serving requests.
 * GET /api/health?db=1   → readiness / uptime check: also checks the database.
 *
 * Use the plain form for the Kubernetes liveness probe (a DB outage shouldn't
 * restart every pod) and `?db=1` for the readiness probe and external uptime
 * checks.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.query.db === undefined) {
    return res.status(200).json({ status: 'ok' });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: 'ok', db: 'ok' });
  } catch (err) {
    logger.error({ err }, 'health check: database unreachable');
    return res.status(503).json({ status: 'error', db: 'unreachable' });
  }
}
