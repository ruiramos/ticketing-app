/**
 * Adds seed data to your db
 *
 * @see https://www.prisma.io/docs/guides/database/seed-database
 */
import { Prisma, PrismaClient } from '~/generated/prisma/client';

const prisma = new PrismaClient();

export async function seedSummerFairEvent(prismaInstance: PrismaClient) {
  const eventId = 'c0cb00ae-fd1a-45ff-985f-38950f605a56';
  const summerFairEventData: Prisma.EventCreateInput = {
    id: eventId,
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
                email: 'ruiramos@gmail.com',
                name: 'Rui',
                role: 'ADMIN',
              },
            ],
          },
        },
      },
    },
  };

  await prismaInstance.event.upsert({
    where: {
      id: summerFairEventData.id,
    },
    create: { ...summerFairEventData },
    update: {}, // No specific update logic, just ensure it exists
  });
  console.log(
    `Event "${summerFairEventData.title}" with ID ${eventId} seeded/updated.`,
  );
}

export async function seedDisabledEvent(prismaInstance: PrismaClient) {
  const eventId = 'disabled-event-12345';

  // First, find the existing organization
  const organization = await prismaInstance.organization.findFirst({
    where: { name: 'FOHPED' },
  });

  if (!organization) {
    throw new Error(
      'FOHPED organization not found. Make sure to run seedSummerFairEvent first.',
    );
  }

  const disabledEventData: Prisma.EventCreateInput = {
    id: eventId,
    title: 'Winter Workshop (Currently Unavailable)',
    text: 'Join us for an exciting winter workshop experience!\n\nThis hands-on workshop will include:\n• Interactive learning sessions\n• Take-home craft projects\n• Refreshments and snacks\n• Fun activities for all ages\n\n• Please arrive 10 minutes early\n• Suitable for ages 5-12\n• Parents must accompany children under 8',
    location: 'Community Center, Main Hall',
    enabled: false, // This event is disabled
    eventExtras: {
      createMany: {
        data: {
          title: 'Take-home kit',
          description: 'Additional craft materials to take home',
          price: 3,
          currency: 'GBP',
        },
      },
    },
    variants: {
      createMany: {
        data: [
          {
            title: '2:00pm - 3:00pm',
            stock: 15,
            price: 12,
            displayOrder: 1,
            currency: 'GBP',
          },
          {
            title: '3:30pm - 4:30pm',
            stock: 15,
            price: 12,
            displayOrder: 2,
            currency: 'GBP',
          },
        ],
      },
    },
    organization: {
      connect: {
        id: organization.id, // Connect using the organization ID
      },
    },
  };

  await prismaInstance.event.upsert({
    where: {
      id: disabledEventData.id,
    },
    create: { ...disabledEventData },
    update: {}, // No specific update logic, just ensure it exists
  });
  console.log(
    `Disabled event "${disabledEventData.title}" with ID ${eventId} seeded/updated.`,
  );
}

async function main() {
  console.log('Starting database seeding...');
  await seedSummerFairEvent(prisma); // Call the extracted function
  await seedDisabledEvent(prisma); // Add the disabled event
  // If there were other events or generic seeding logic, it would go here.
  console.log('Database seeding finished.');
}

main()
  .catch((e) => {
    console.error('Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('Prisma client disconnected.');
  });
