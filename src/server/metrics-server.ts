import http from 'node:http';
import { logger } from './logger';
import { metrics } from './metrics';

/**
 * Serves Prometheus metrics on its own port, separate from the app port, so
 * they are only reachable from inside the cluster.
 */
export function startMetricsServer(port: number) {
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await metrics.registry.metrics();
      res.writeHead(200, { 'Content-Type': metrics.registry.contentType });
      res.end(body);
    } catch (err) {
      logger.error({ err }, 'failed to render metrics');
      res.writeHead(500).end();
    }
  });

  server.on('error', (err) => {
    // never take the app down because of the metrics port
    logger.error({ err, port }, 'metrics server error');
  });

  server.listen(port, () => {
    logger.info({ port }, 'metrics server listening');
  });

  // don't keep the process alive just for metrics
  server.unref();
}
