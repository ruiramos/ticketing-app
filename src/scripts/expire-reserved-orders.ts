import 'dotenv/config';
import { prisma } from '../server/prisma';

async function doIt() {
  const orders = await prisma.order.findMany({
    where: {
      status: 'RESERVED',
      createdAt: {
        // more than 5 minutes ago
        lt: new Date(Date.now() - 1000 * 60 * 5),
      },
    },
    include: {
      variant: true,
    },
  });

  orders.forEach(async (order) => {
    console.log(
      `Expiring order ${order.id} - releasing ${order.quantity} tickets to variant ${order.variant.id} - ${order.variant.title}`,
    );
    await prisma.$transaction([
      prisma.variant.update({
        where: {
          id: order.variant.id,
        },
        data: {
          stock: {
            increment: order.quantity,
          },
        },
      }),
      prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'EXPIRED',
        },
      }),
    ]);
  });

  return orders.length;
}

doIt().then((result) => {
  console.log(`Done expiring orders - orders affected: ${result}`);
});
