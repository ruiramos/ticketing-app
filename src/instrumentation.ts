/**
 * Runs once when the Next.js server starts.
 * @see https://nextjs.org/docs/app/guides/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Metrics are on by default in production; set METRICS_PORT=0 to disable,
  // or set it explicitly to run them locally.
  const configured = process.env.METRICS_PORT;
  const port = configured
    ? Number(configured)
    : process.env.NODE_ENV === 'production'
      ? 9464
      : 0;

  if (port > 0) {
    const { startMetricsServer } = await import('./server/metrics-server');
    startMetricsServer(port);
  }
}
