/**
 * Prometheus metrics for the app.
 *
 * Exposed on a separate port (METRICS_PORT, default 9464) by
 * `src/instrumentation.ts`, so `/metrics` is never reachable through the
 * public ingress. Grafana Alloy scrapes it via pod annotations.
 *
 * Keep label values low-cardinality: never put order ids, emails or other
 * per-request values in labels. Put those in logs instead.
 *
 * Next.js can compile this module into more than one bundle (instrumentation,
 * API routes), so the registry and metrics live on `globalThis` to make sure
 * every bundle increments the same counters.
 */
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from '@prometheus-io/client';

function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const registers = [registry];

  return {
    registry,

    trpcRequests: new Counter({
      name: 'ticketing_trpc_requests_total',
      help: 'tRPC procedure calls by outcome. code is OK or a tRPC error code.',
      labelNames: ['procedure', 'type', 'code'] as const,
      registers,
    }),
    trpcDuration: new Histogram({
      name: 'ticketing_trpc_request_duration_seconds',
      help: 'tRPC procedure duration in seconds',
      labelNames: ['procedure', 'type'] as const,
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers,
    }),

    ordersReserved: new Counter({
      name: 'ticketing_orders_reserved_total',
      help: 'Orders created in RESERVED state (stock held, awaiting payment)',
      registers,
    }),
    orderReservationFailures: new Counter({
      name: 'ticketing_order_reservation_failures_total',
      help: 'Failed attempts to reserve an order',
      labelNames: ['reason'] as const, // out_of_stock | paypal_error
      registers,
    }),
    ordersConfirmed: new Counter({
      name: 'ticketing_orders_confirmed_total',
      help: 'Orders paid and CONFIRMED',
      registers,
    }),
    ticketsSold: new Counter({
      name: 'ticketing_tickets_sold_total',
      help: 'Tickets in confirmed orders',
      registers,
    }),
    revenue: new Counter({
      name: 'ticketing_revenue_total',
      help: 'Value of confirmed orders, in major currency units',
      labelNames: ['currency'] as const,
      registers,
    }),
    orderCaptureFailures: new Counter({
      name: 'ticketing_order_capture_failures_total',
      help: 'Failures while capturing an order. stage: confirm (reservation gone/expired), payment (PayPal capture failed), post_capture (paid but saving details failed)',
      labelNames: ['stage'] as const,
      registers,
    }),
    ordersCancelled: new Counter({
      name: 'ticketing_orders_cancelled_total',
      help: 'Confirmed orders cancelled by an admin',
      registers,
    }),
    ordersRefunded: new Counter({
      name: 'ticketing_orders_refunded_total',
      help: 'Refunds of cancelled orders through PayPal, by outcome',
      labelNames: ['outcome'] as const, // refunded | pending | failed
      registers,
    }),

    paypalRequests: new Counter({
      name: 'ticketing_paypal_requests_total',
      help: 'Calls to the PayPal API',
      labelNames: ['operation', 'outcome'] as const,
      registers,
    }),
    paypalDuration: new Histogram({
      name: 'ticketing_paypal_request_duration_seconds',
      help: 'PayPal API call duration in seconds',
      labelNames: ['operation'] as const,
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers,
    }),

    emailsSent: new Counter({
      name: 'ticketing_emails_total',
      help: 'Transactional emails by outcome',
      labelNames: ['outcome'] as const,
      registers,
    }),
  };
}

type Metrics = ReturnType<typeof createMetrics>;

const key = Symbol.for('ticketing-app.metrics');
const g = globalThis as typeof globalThis & { [key]?: Metrics };

export const metrics: Metrics = (g[key] ??= createMetrics());

/** Times a PayPal API call and counts its outcome. Rethrows any error. */
export async function trackPaypal<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const end = metrics.paypalDuration.startTimer({ operation });
  try {
    const result = await fn();
    metrics.paypalRequests.inc({ operation, outcome: 'success' });
    return result;
  } catch (error) {
    metrics.paypalRequests.inc({ operation, outcome: 'error' });
    throw error;
  } finally {
    end();
  }
}
