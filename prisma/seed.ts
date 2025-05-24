/**
 * Adds seed data to your db
 *
 * @see https://www.prisma.io/docs/guides/database/seed-database
 */
import { Prisma, PrismaClient } from '~/generated/prisma/client';

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
          title: 'Gift the grotto',
          description:
            'Gift a grotto ticket to another child when you buy your entry - available for an extra £5.',
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
            displayOrder: 1,
            currency: 'GBP',
          },
          {
            title: '10:15am - 10:30am',
            stock: 2,
            price: 5,
            displayOrder: 2,
            currency: 'GBP',
          },
          {
            title: '10:30am - 10:45am',
            stock: 0,
            price: 5,
            displayOrder: 3,
            currency: 'GBP',
          },
          {
            title: '10:45am - 11:00am',
            stock: 10,
            price: 7.5,
            displayOrder: 4,
            currency: 'GBP',
          },
        ],
      },
    },
    organization: {
      create: {
        name: 'FOHPED',
        email: 'info@friendsofhped.com',
        phone: '07712345678',
        address: 'ferris road',
        city: 'London',
        postCode: 'se22 9nd',
        users: {
          createMany: {
            data: [
              {
                email: 'fairs@friendsofhped.com',
                name: 'Vicky',
                role: 'ADMIN',
              },
              {
                email: 'comms@friendsofhped.com',
                name: 'Rui',
                role: 'ADMIN',
              },
            ],
          },
        },
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
