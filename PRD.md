# Ticketing Platform — Product Improvements PRD

> Status: Draft · Last updated: 2026-06-07
>
> A prioritized backlog of improvements for the multi-tenant event ticketing
> platform (Next.js + tRPC + Prisma + PayPal). Each item lists a description,
> rationale, rough scope, **complexity** (S / M / L / XL) and **priority**
> (P0 critical → P3 nice-to-have).

## Legend

| Complexity | Meaning |
|------------|---------|
| **S** | < 1 day, isolated change |
| **M** | 1–3 days, touches a few modules |
| **L** | ~1 week, schema + API + UI |
| **XL** | Multi-week, cross-cutting / migration |

| Priority | Meaning |
|----------|---------|
| **P0** | Blocking / correctness / revenue or data risk |
| **P1** | High value, do soon |
| **P2** | Valuable, schedule when capacity allows |
| **P3** | Nice-to-have / polish |

---

## Summary table

| # | Improvement | Complexity | Priority |
|---|-------------|:----------:|:--------:|
| 1 | Templated emails configured per event | L | P1 |
| 2 | Per-organization PayPal configuration | L | P0 |
| 3 | Stripe payment integration (multi-provider) | XL | P1 |
| 4 | QR/barcode tickets + scan-based check-in | L | P1 |
| 5 | Harden order-expiry script (unawaited async loop) | S | P1 |
| 6 | Discount / promo codes | L | P2 |
| 7 | Refunds & customer-initiated cancellation | M | P1 |
| 8 | Enforce ADMIN/USER role-based access control | M | P1 |
| 9 | Organization dashboard & sales analytics | M | P2 |
| 10 | Multi-currency & i18n of customer-facing copy | L | P2 |
| 11 | Order/attendee search, filtering & CSV export | M | P2 |
| 12 | Data-integrity hardening (unique email, txn fixes) | S | P1 |
| 13 | Waitlist for sold-out variants | M | P3 |
| 14 | Resend / re-issue confirmation emails | S | P2 |

---

## 1. Templated emails configured per event

**Priority: P1 · Complexity: L**

Today the confirmation email is a single hardcoded HTML block in
`src/utils/email.ts` (`generateMailContent`, lines ~46–82), complete with
leftover sample copy ("Slime Experience", etc.) and a hardcoded sender
`ticketing@ruiramos.com`. Every organization sends the same email.

**Proposal**

- Introduce a templating layer (e.g. Handlebars / MJML) with a defined set of
  variables: `{{event.title}}`, `{{order.items}}`, `{{order.total}}`,
  `{{customer.name}}`, `{{event.location}}`, `{{ticketUrl}}`, etc.
- Move the editable copy (subject, intro/outro body, sender name) into
  **event setup** (`event.ts` create/update + admin event form), with a
  sensible org-level default fallback.
- Store templates on the `Event` (or a new `EmailTemplate` model keyed by event
  + type) so each event can customize its confirmation email.
- Render server-side at send time in `order.ts` (capture flow, ~lines 340–351).

**Scope:** schema migration, template engine, event-form UI, render pipeline,
preview/test-send. Validation of template variables to avoid broken sends.

**Open questions:** WYSIWYG vs. raw template editing? Per-org branding (logo,
colors) reuse from `Organization.logoUrl`?

---

## 2. Per-organization PayPal configuration

**Priority: P0 · Complexity: L**

PayPal credentials are global env vars (`PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET` in `src/server/env.ts`; client built once in
`order.ts` lines ~18–31). In a multi-tenant platform this means **all orgs'
revenue flows to one PayPal account** — a blocker for real multi-tenant use.

**Proposal**

- Add PayPal credentials (client ID, secret, environment) to the
  `Organization` model, encrypted at rest.
- Build the PayPal client per-request from the event's organization instead of
  a module-level singleton.
- Admin UI under organization settings to enter/validate credentials, with a
  connection test.
- Frontend `@paypal/react-paypal-js` must load the org's client ID dynamically
  (currently injected via `NEXT_PUBLIC_PAYPAL_CLIENT_ID` build arg in the
  Dockerfile/CI — needs to become runtime, per-event).

**Scope:** schema migration, secret encryption strategy, refactor PayPal client
construction, settings UI, dynamic client-side SDK loading.

**Risk:** secret handling — must not log credentials (current setup logs
requests/responses at Info level). Consider PayPal Partner/Connected-accounts
OAuth onboarding instead of raw key entry.

> Recommended to sequence **before or alongside #3**, since both reshape how
> payment provider config is resolved per organization.

---

## 3. Stripe payment integration (multi-provider)

**Priority: P1 · Complexity: XL**

Add Stripe as a payment option — additionally to, or as a replacement for,
PayPal. Payment logic is currently PayPal-specific throughout `order.ts`
(`createOrder`/`captureOrder`, `externalId`/`externalTransactionId` fields).

**Proposal**

- Introduce a **payment-provider abstraction**: a common interface
  (`createPayment`, `capturePayment`, `refundPayment`, webhook verification)
  with PayPal and Stripe implementations.
- Per-organization (and possibly per-event) choice of provider — builds
  naturally on #2's per-org config model.
- Stripe specifics: PaymentIntents + webhooks for async confirmation (more
  reliable than the current synchronous capture model), Stripe Connect for
  multi-tenant payouts.
- Generalize order fields: `externalId`/`externalTransactionId` already
  provider-agnostic in naming; add a `paymentProvider` column.
- Frontend: provider-conditional checkout component.

**Scope:** abstraction layer, Stripe SDK + webhooks endpoint, Connect
onboarding, schema changes, UI, extensive tests (the existing
`order.test.ts` mocks PayPal directly — needs restructuring around the
interface).

**Open questions:** Stripe Connect (Standard vs. Express)? Keep PayPal or
migrate fully? Webhook-driven confirmation changes the RESERVED→CONFIRMED
timing assumptions and the expiry window (#5).

---

## 4. QR / barcode tickets + scan-based check-in

**Priority: P1 · Complexity: L**

Check-in today is a manual toggle (`toggleCheckin`, check-in page searches by
name/email). No machine-readable ticket exists.

**Proposal**

- Generate a signed QR code per order (or per ticket/quantity) embedded in the
  confirmation email (ties into #1) and/or a hosted ticket page.
- Build a mobile-friendly scanner view for door staff that calls
  `toggleCheckin` on scan, with duplicate-scan detection (`checkedIn`,
  `checkedInAt` already exist).
- Consider one QR per attendee when `quantity > 1`.

**Scope:** token signing, QR generation, email/ticket-page embed, scanner UI
(camera access), check-in API hardening against double check-in.

---

## 5. Harden order-expiry script (unawaited async loop)

**Priority: P1 · Complexity: S**

`src/scripts/expire-reserved-orders.ts` releases stock from stale RESERVED
orders and is **already run on a schedule via an external cronjob** — so the
scheduling concern is handled. Each per-order stock-release + status-update is
also already wrapped in a `prisma.$transaction` (making the line-7 TODO mostly
stale).

The remaining issue is correctness of the script itself: line ~21 uses
`orders.forEach(async (order) => { … })`, which fires the async callbacks
without awaiting them. `doIt()` therefore resolves and logs
`Done … orders affected: N` before those transactions have completed. In a
short-lived cron process the runtime can exit before all updates land, and the
reported count is unreliable.

**Proposal**

- Replace the unawaited `forEach(async …)` with a properly awaited loop
  (`for…of` with `await`, or `Promise.all(orders.map(…))`) so the process only
  exits after all expirations commit.
- Remove the now-stale transaction TODO comment (line ~7).
- Add a test for the expiry path (and re-check the disabled test in
  `order.test.ts`, see #12).

**Scope:** a few lines + a test. Cheap correctness win; no infra change needed.

---

## 6. Discount / promo codes

**Priority: P2 · Complexity: L**

No discount mechanism exists; prices are fixed per variant.

**Proposal**

- New `DiscountCode` model (code, type: percentage/fixed, value, usage limit,
  per-code and per-event scope, validity window, min spend).
- Apply at `createOrder` time with server-side validation (never trust
  client-computed totals).
- Track redemptions; enforce limits atomically alongside stock.
- Admin UI to create/manage codes per event or per organization.

**Scope:** schema, pricing logic in order flow, validation, admin UI, tests.

---

## 7. Refunds & customer-initiated cancellation

**Priority: P1 · Complexity: M**

`cancelOrder` exists but is admin-only and does not issue a payment refund —
it only flips status and releases stock. Customers cannot cancel.

**Proposal**

- Add provider refund calls (PayPal now, Stripe via #3) on cancellation of a
  CONFIRMED order.
- Optional customer-facing cancellation (policy-gated: cutoff time, refund
  percentage).
- Record refund state/amount on the order; handle partial refunds.

**Scope:** provider refund integration, status/amount tracking, policy config,
UI for both admin and (optionally) customer.

---

## 8. Enforce ADMIN/USER role-based access control

**Priority: P1 · Complexity: M**

The `Role` enum (ADMIN/USER) exists and org membership is modeled, but the
distinction is **not enforced** in most tRPC procedures — any org member can
perform admin actions.

**Proposal**

- Add an `adminProcedure` middleware in `trpc.ts` building on the existing
  `authedProcedureWithEventId` org-ownership check.
- Audit each mutation (event CRUD, member management, check-in, cancellation)
  and gate appropriately.
- Reflect roles in the admin UI (hide/disable controls).

**Scope:** middleware, per-route audit, tests for authz, minor UI gating.
Security-relevant — prevents privilege escalation within an org.

---

## 9. Organization dashboard & sales analytics

**Priority: P2 · Complexity: M**

No revenue/sales reporting beyond raw order lists.

**Proposal**

- Per-event and per-org dashboard: tickets sold vs. capacity, revenue,
  conversion (RESERVED→CONFIRMED), check-in rate, sales over time.
- Aggregate queries (consider DB indexes on `Order.status`, `eventId`,
  `createdAt`).

**Scope:** aggregation endpoints, charts UI. Read-only — low risk.

---

## 10. Multi-currency & i18n of customer-facing copy

**Priority: P2 · Complexity: L**

Currency is hardcoded GBP across order/PayPal flow; customer-facing strings are
English-only. Variants already carry a `currency` field that isn't fully
honored end-to-end.

**Proposal**

- Honor per-variant/per-event currency through pricing, payment provider, and
  emails.
- Introduce an i18n framework (e.g. `next-intl`) for customer-facing pages and
  emails; org/event-level locale.

**Scope:** thread currency consistently, add i18n infra, extract strings.

---

## 11. Order/attendee search, filtering & CSV export

**Priority: P2 · Complexity: M**

Order search is limited (name/email for check-in). No export.

**Proposal**

- Filter orders by status, date range, variant, check-in state.
- Server-side pagination (some exists in `user.ts`) extended to admin order
  views.
- CSV/Excel export of attendees (including `customFieldResponses`) for an event.

**Scope:** query params + indexes, admin UI, export endpoint.

---

## 12. Data-integrity hardening

**Priority: P1 · Complexity: S**

Several flagged correctness gaps:

- `User.email` is **not unique** (schema TODO "unique???", line ~154) — risks
  duplicate accounts and ambiguous lookups.
- Expiry script transaction handling (see #5).
- `order.test.ts` has a disabled/TODO test (line ~46).

**Proposal**

- Add a unique constraint on `User.email` (with a data-dedup migration step).
- Resolve the open TODOs and re-enable the skipped test.

**Scope:** small migrations + test fixes. Cheap correctness wins.

---

## 13. Waitlist for sold-out variants

**Priority: P3 · Complexity: M**

When a variant hits zero stock, demand is lost.

**Proposal**

- Allow customers to join a waitlist per variant; notify (email, ties to #1)
  when stock frees up (e.g. via expiry #5 or a cancellation #7).
- Optional time-boxed claim window for notified users.

**Scope:** schema, notification trigger, opt-in UI.

---

## 14. Resend / re-issue confirmation emails

**Priority: P2 · Complexity: S**

If a confirmation email fails (currently only console-logged) or a customer
loses it, there's no recovery path.

**Proposal**

- Admin action to re-send the confirmation (and QR ticket, #4) for an order.
- Surface email send status/errors on the order (the `Order.error` JSON field
  could capture this).

**Scope:** small endpoint + admin button; reuses the templated-email pipeline.

---

## Suggested sequencing

1. **Quick wins / correctness (P0–P1, low effort):** #5 expiry-script fix,
   #12 data integrity, #8 RBAC.
2. **Multi-tenant payments foundation:** #2 per-org PayPal → #3 Stripe
   abstraction (do together; #2's config model feeds #3).
3. **Customer experience:** #1 templated emails → #4 QR tickets → #7 refunds.
4. **Growth / ops:** #6 discounts, #9 analytics, #11 search/export,
   #10 i18n/currency.
5. **Later:** #13 waitlist, #14 resend.
