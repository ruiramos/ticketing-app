# Testing Documentation

## Overview

This project uses a separate test database to ensure your development data is never affected by running tests. All tests run in complete isolation using a dedicated PostgreSQL database.

## Database Setup

### Main Database
- **Name**: `ticketing`
- **Purpose**: Development and production data
- **URL**: `postgresql://postgres:example@localhost:5432/ticketing`

### Test Database
- **Name**: `ticketing_test`
- **Purpose**: Unit and integration tests only
- **URL**: `postgresql://postgres:example@localhost:5432/ticketing_test`

## Environment Files

### `.env` (Development)
Contains your main development environment variables including the main database connection.

### `.env.test` (Testing)
Contains test-specific environment variables with the test database connection:
```env
DATABASE_URL=postgresql://postgres:example@localhost:5432/ticketing_test
NODE_ENV=test
NEXT_PUBLIC_PAYPAL_ENV=Sandbox
```

## Running Tests

### Setup Test Database
```bash
# Create/reset the test database
npm run test-db-setup
```

### Run All Tests
```bash
# Run all unit tests (uses test database automatically)
npm run test-unit

# Run all tests including setup
npm run test-start
```

### Run Specific Test Files
```bash
# Run specific router tests
npm run test-unit src/server/routers/event.test.ts
npm run test-unit src/server/routers/user.test.ts
npm run test-unit src/server/routers/order.test.ts
```

### Reset Test Database
```bash
# Clean slate for test database
npm run test-db-reset
```

## Test Structure

### Current Test Coverage
- **Event Router Tests**: 11 tests - Event creation, validation, updates
- **User Router Tests**: 13 tests - Authentication, authorization, user data
- **Order Router Tests**: 8 tests - Order creation, stock management, PayPal integration
- **Total**: 32 comprehensive test cases

### Test Categories

#### Unit Tests (`src/server/routers/*.test.ts`)
- **Authentication & Authorization**: Session handling, permissions
- **Database Operations**: CRUD operations, transactions, integrity
- **Business Logic**: Validation, stock management, pricing
- **Error Handling**: Edge cases, invalid inputs, unauthorized access
- **External Services**: Mocked PayPal and email integrations

### Test Configuration

#### Sequential Execution
Tests run sequentially to avoid database conflicts:
```typescript
// vitest.config.ts
poolOptions: {
  threads: { singleThread: true },
},
fileParallelism: false,
maxConcurrency: 1,
```

#### Database Isolation
Each test file cleans up after itself:
```typescript
beforeEach(async () => {
  // Clean database state
  await prisma.order.deleteMany();
  await prisma.eventExtras.deleteMany();
  // ...
});
```

## Verification

### Check Database Separation
```bash
# Verify your data is safe
npm run verify-dbs
```

Expected output:
```
📊 Main database (ticketing): X events
🧪 Test database (ticketing_test): 0 events
✅ Databases are properly separated!
```

## Safety Features

### Environment Validation
- Test setup validates that `DATABASE_URL` contains `_test`
- Prevents accidental data loss from wrong database connections
- Environment variables are strictly validated

### Data Protection
- Tests never touch your main development database
- Each test run starts with a clean test database
- Test data is completely isolated

### Error Prevention
```typescript
// Safety check in vitest.setup.ts
if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('Test database URL must contain "_test" to prevent data loss');
}
```

## Adding New Tests

### Test File Template
```typescript
import { createContextInner } from '../context';
import { createCaller } from './_app';
import { prisma } from '../prisma';

// Database cleanup
beforeEach(async () => {
  // Clean related tables
});

describe('myRouter.myMutation', () => {
  test('should handle success case', async () => {
    // Setup test data
    // Create authenticated context
    // Call mutation
    // Assert results
  });

  test('should handle error case', async () => {
    // Test error conditions
  });
});
```

### Best Practices
1. **Clean State**: Always clean database in `beforeEach`
2. **Realistic Data**: Create proper relationships and valid test data
3. **Authentication**: Use `createContextInner` for auth simulation
4. **Comprehensive**: Test both success and failure cases
5. **Isolation**: Each test should be independent

## Troubleshooting

### Database Connection Issues
```bash
# Ensure PostgreSQL is running
brew services start postgresql

# Check database exists
psql -U postgres -h localhost -l
```

### Test Failures
```bash
# Reset test database
npm run test-db-reset

# Verify database separation
npm run verify-dbs

# Run tests in watch mode for debugging
npm run test-unit -- --watch
```

### Environment Issues
- Ensure `.env.test` exists with correct values
- Check `NEXT_PUBLIC_PAYPAL_ENV=Sandbox` (capital S)
- Verify all required environment variables are set

## Performance

### Test Execution Time
- Full test suite: ~1.5 seconds
- Sequential execution ensures reliability
- Database operations are optimized for test speed

### CI/CD Considerations
Tests are ready for CI/CD pipelines:
- Self-contained database setup
- No external dependencies (mocked services)
- Deterministic results
- Proper cleanup and isolation