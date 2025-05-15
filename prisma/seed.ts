/**
 * Adds seed data to your db
 *
 * @see https://www.prisma.io/docs/guides/database/seed-database
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const id = 'c0cb00ae-fd1a-45ff-985f-38950f605a56';
  const firstEvent: Prisma.EventCreateInput = {
    id: id,
    title: 'Summer fair',
    text: 'A very summer fair',
    enabled: true,
    eventExtras: {
      createMany: {
        data: {
          title: 'Gift the grotto?',
          price: 5,
          currency: 'GBP',
        },
      },
    },
    variants: {
      createMany: {
        data: [
          {
            title: '10:00am - 10:15am',
            stock: 10,
            price: 5,
            order: 1,
            currency: 'GBP',
          },
          {
            title: '10:15am - 10:30am',
            stock: 2,
            price: 5,
            order: 2,
            currency: 'GBP',
          },
          {
            title: '10:30am - 10:45am',
            stock: 0,
            price: 5,
            order: 3,
            currency: 'GBP',
          },
          {
            title: '10:45am - 11:00am',
            stock: 10,
            price: 7.5,
            order: 4,
            currency: 'GBP',
          },
        ],
      },
    },
  };
  await prisma.event.upsert({
    where: {
      id: firstEvent.id,
    },
    create: { ...firstEvent },
    update: {},
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
