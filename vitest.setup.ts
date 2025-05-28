import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Ensure we're using the test database
if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('Test database URL must contain "_test" to prevent data loss');
}

console.log('Using test database:', process.env.DATABASE_URL);