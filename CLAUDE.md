# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js ticketing application built with tRPC, Prisma, and TypeScript. It's a full-stack event management system that allows organizations to create events, manage tickets, and process orders through PayPal integration.

## Key Architecture

### Tech Stack
- **Framework**: Next.js 15 with Pages Router
- **Database**: PostgreSQL with Prisma ORM
- **API**: tRPC for type-safe API endpoints
- **Authentication**: NextAuth.js
- **Payments**: PayPal integration
- **Styling**: Tailwind CSS with Radix UI components
- **Testing**: Vitest for unit tests, Playwright for E2E tests

### Database Schema
The application uses separate databases for development (`ticketing`) and testing (`ticketing_test`):
- **Organizations**: Multi-tenant structure with user roles (USER/ADMIN)
- **Events**: Ticketing events with variants (different ticket types) and extras
- **Orders**: Ticket purchases with PayPal integration and order status tracking
- **Users**: Authentication and organization membership

### tRPC Router Structure
API is organized into three main routers in `src/server/routers/`:
- `event.ts`: Event creation, updates, and retrieval
- `order.ts`: Order processing, PayPal integration, stock management
- `user.ts`: Authentication, user management, organization invitations

## Development Commands

### Core Development
```bash
pnpm dev          # Start development server (runs migrations + seed + next dev)
pnpm dx           # Full development setup (postgres + migrations + seed + dev server)
pnpm build        # Production build
pnpm start        # Start production server
```

### Database Management
```bash
pnpm generate     # Generate Prisma client
pnpm migrate-dev  # Run database migrations in development
pnpm db-seed      # Seed database with test data
pnpm db-reset     # Reset database and reseed
```

### Testing
```bash
pnpm test-unit    # Run unit tests (uses test database)
pnpm test-e2e     # Run Playwright E2E tests with UI
pnpm test-start   # Run all tests (setup + unit + e2e)
pnpm test-db-setup # Setup/reset test database
```

### Code Quality
```bash
pnpm lint         # Run ESLint
pnpm lint-fix     # Fix ESLint issues
```

## Database Testing Strategy

This project uses complete database separation for testing:
- **Development**: `postgresql://postgres:example@localhost:5432/ticketing`
- **Testing**: `postgresql://postgres:example@localhost:5432/ticketing_test`

The test database is automatically reset before each test run. All tests use the `.env.test` environment file to ensure isolation. Use `pnpm verify-dbs` to verify database separation.

## Project Structure

### Key Directories
- `src/pages/`: Next.js pages (both UI and API routes)
- `src/server/routers/`: tRPC API endpoint definitions
- `src/components/`: React components (UI components in `ui/` subdirectory)
- `prisma/`: Database schema and migrations
- `playwright/`: E2E test files

### Authentication Flow
Uses NextAuth.js with custom signin page at `/auth/signin`. Authentication context is available throughout the app via tRPC context.

### Payment Integration
PayPal integration for order processing. Orders have statuses: RESERVED ’ CONFIRMED/CANCELLED/EXPIRED.

## Important Notes

- Always use the test database for unit tests (automatically configured)
- Database operations should use Prisma client from `src/server/prisma.ts`
- tRPC procedures are type-safe - use proper input/output validation with Zod
- The application supports multi-tenancy through Organizations
- Stock management is handled automatically during order processing
- Email functionality uses SendGrid (mocked in tests)

## Environment Setup

Requires `.env` for development and `.env.test` for testing. Key variables include:
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Authentication secret
- PayPal configuration for payment processing
- SendGrid API key for email functionality