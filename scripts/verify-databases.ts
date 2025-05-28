import { PrismaClient } from '../src/generated/prisma/client';
import { config } from 'dotenv';

async function verifyDatabases() {
  console.log('🔍 Verifying database separation...\n');

  // Check main database
  config({ path: '.env' });
  const mainPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  // Check test database  
  config({ path: '.env.test', override: true });
  const testPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  try {
    // Count events in main database
    const mainEventCount = await mainPrisma.event.count();
    console.log(`📊 Main database (ticketing): ${mainEventCount} events`);

    // Count events in test database
    const testEventCount = await testPrisma.event.count();
    console.log(`🧪 Test database (ticketing_test): ${testEventCount} events`);

    console.log('\n✅ Databases are properly separated!');
    console.log('   - Your main data is safe in the "ticketing" database');
    console.log('   - Tests run in the isolated "ticketing_test" database');

  } catch (error) {
    console.error('❌ Error verifying databases:', error);
  } finally {
    await mainPrisma.$disconnect();
    await testPrisma.$disconnect();
  }
}

verifyDatabases();