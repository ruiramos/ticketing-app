import 'dotenv/config';
import { prisma } from '../server/prisma';
import { logger as baseLogger } from '../server/logger';

const HOW_MANY_MINUTES = 5;

const logger = baseLogger.child({ job: 'expire-reserved' });

type Summary = {
  found: number;
  expired: number;
  ticketsReleased: number;
  skipped: number;
  failed: number;
};

async function doIt(): Promise<Summary> {
  const orders = await prisma.order.findMany({
    where: {
      status: 'RESERVED',
      createdAt: {
        // more than 5 minutes ago
        lt: new Date(Date.now() - 1000 * 60 * HOW_MANY_MINUTES),
      },
    },
    include: {
      variant: true,
    },
  });

  const summary: Summary = {
    found: orders.length,
    expired: 0,
    ticketsReleased: 0,
    skipped: 0,
    failed: 0,
  };

  for (const order of orders) {
    try {
      const expired = await prisma.$transaction(async (tx) => {
        // Only expire if still RESERVED: the customer may have paid since we
        // read it, and releasing a confirmed order's stock would oversell.
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: 'RESERVED' },
          data: { status: 'EXPIRED' },
        });
        if (count === 0) return false;

        await tx.variant.update({
          where: { id: order.variant.id },
          data: { stock: { increment: order.quantity } },
        });
        return true;
      });

      if (expired) {
        summary.expired++;
        summary.ticketsReleased += order.quantity;
        logger.info(
          {
            orderId: order.id,
            eventId: order.eventId,
            variantId: order.variant.id,
            quantity: order.quantity,
          },
          'reservation expired, tickets released',
        );
      } else {
        summary.skipped++;
        logger.info(
          { orderId: order.id },
          'order no longer RESERVED, skipping',
        );
      }
    } catch (err) {
      summary.failed++;
      logger.error({ err, orderId: order.id }, 'failed to expire reservation');
    }
  }

  return summary;
}

doIt()
  .then((summary) => {
    // One line per run with the totals. Alerts and dashboards in Grafana
    // are built from this line, so keep the message and field names stable.
    const log = summary.failed > 0 ? logger.error : logger.info;
    log.call(logger, summary, 'expire-reserved run complete');
    if (summary.failed > 0) process.exitCode = 1;
  })
  .catch((err) => {
    logger.error({ err }, 'expire-reserved run failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
