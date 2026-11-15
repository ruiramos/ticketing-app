# Monitoring: Grafana Cloud on Civo k3s

Everything goes to a **Grafana Cloud free** stack:

| What | How it's collected | Where to look |
|---|---|---|
| Container CPU, memory, restarts, OOMKills, CronJob status | `k8s-monitoring` Helm chart: Alloy + kube-state-metrics + cAdvisor | Kubernetes Monitoring app, dashboard "Containers" row |
| HTTP requests by status code, latency | Traefik's Prometheus metrics | dashboard "Traffic" row |
| tRPC calls by procedure and result | app metrics on port 9464 (`src/server/metrics.ts`) | dashboard "Traffic" row |
| Tickets sold, reservations, payments, PayPal, email | app metrics on port 9464 | dashboard "Sales" row |
| Reservations expired, expiry job errors | expiry job's JSON summary log line | dashboard "Sales" + "Containers" rows |
| Logs | pod stdout → Loki; app writes JSON with pino (`src/server/logger.ts`) | Explore → Loki, dashboard "Logs" row |
| Uptime from outside the cluster | Synthetic Monitoring | Testing & synthetics |

Files in this folder:

- `k8s-monitoring-values.yaml`: Helm values for the cluster agent.
- `traefik-metrics.yaml`: turns on Traefik metrics scraping.
- `app-manifests.example.yaml`: annotations, port and probes to merge into the app's Deployment and CronJob.
- `alerts.md`: the alert rules, with queries.
- `grafana-dashboard.json`: dashboard to import.

Expect around 30–45 minutes for the whole setup.

---

## 1. Create the Grafana Cloud stack

1. Sign up at grafana.com and create a stack on the **Free** plan. Pick the
   **EU (London, eu-west-2)** region if it's offered, as it's closest to Civo LON1.
2. In the Cloud portal (grafana.com → My Account → your stack), click
   **Details** on the **Prometheus** card. Note:
   - **Remote Write Endpoint**, e.g. `https://prometheus-prod-XX-prod-eu-west-2.grafana.net/api/prom/push`
   - **Username / Instance ID**, a number
3. Do the same on the **Loki** card. Note:
   - **URL**, e.g. `https://logs-prod-0XX.grafana.net`. Add `/loki/api/v1/push` to the end.
   - **User**, a different number

## 2. Create an access token and store it in the cluster

1. Cloud portal → **Security → Access Policies → Create access policy**
   - Name: `k8s-monitoring-civo`
   - Realm: your stack
   - Scopes: **metrics: write**, **logs: write**
2. On that policy, **Add token**. Copy it; it's shown once.
3. Create the namespace and secret (the token never goes into git):

```bash
kubectl create namespace monitoring

kubectl -n monitoring create secret generic grafana-cloud \
  --from-literal=prom-username='<PROMETHEUS_INSTANCE_ID>' \
  --from-literal=loki-username='<LOKI_USER>' \
  --from-literal=access-token='<TOKEN>'
```

## 3. Install the cluster agent

Edit `k8s-monitoring-values.yaml`: set the two URLs from step 1 (and change
`cluster.name` if you like). Then:

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install k8s-monitoring grafana/k8s-monitoring \
  --version 4.6.1 \
  --namespace monitoring \
  -f deploy/monitoring/k8s-monitoring-values.yaml \
  --wait
```

The chart version is pinned because its values format changes between majors.
The values were checked against 4.6.1 with `helm template`.

**Check it's working**

```bash
kubectl -n monitoring get pods
# expect: alloy-operator, k8s-monitoring-alloy-metrics-0, alloy-logs (one per node),
# alloy-singleton, kube-state-metrics, node-exporter (one per node), all Running
```

Within a couple of minutes, in Grafana → **Explore**:
- Metrics data source: `up{cluster="civo-ticketing"}` returns rows.
- Logs data source: `{cluster="civo-ticketing"}` shows log lines.
- **Observability → Kubernetes** shows the cluster, nodes and pods with CPU,
  memory and restarts. You get that part with no app changes.

If nothing arrives, check the collector logs:
`kubectl -n monitoring logs statefulset/k8s-monitoring-alloy-metrics | grep -i error`.
A `401` means the username, URL or token in the secret don't match.

## 4. Traefik request metrics

Check how Traefik was installed:

```bash
kubectl -n kube-system get helmchart traefik
```

**If that returns a resource** (standard k3s/Civo setup):

```bash
kubectl apply -f deploy/monitoring/traefik-metrics.yaml
# k3s redeploys Traefik with the extra values; takes ~30s
kubectl -n kube-system rollout status deploy/traefik
```

**Traefik installed some other way:** add these annotations to the Traefik
pod template using whatever installed it (Helm values `deployment.podAnnotations`):

```yaml
k8s.grafana.com/scrape: "true"
k8s.grafana.com/job: traefik
k8s.grafana.com/metrics.portNumber: "9100"
```

**Check it's working.** Confirm Traefik serves metrics on 9100:

```bash
kubectl -n kube-system port-forward deploy/traefik 9100:9100 &
curl -s localhost:9100/metrics | grep -m3 traefik_service_requests_total
kill %1
```

If port 9100 has nothing, find the metrics port with
`kubectl -n kube-system get deploy traefik -o yaml | grep -B2 -A2 metrics`
and change `metrics.portNumber` to match.
Then in Explore: `sum by (service, code) (rate(traefik_service_requests_total[5m]))`.

## 5. Deploy the app changes

1. Merge the fields marked `# <-- monitoring` from `app-manifests.example.yaml`
   into your Deployment and CronJob:
   - pod annotations (scraping + log `job` label)
   - container port 9464 (**don't** add it to the Service or Ingress)
   - liveness and readiness probes on `/api/health`
   - a memory limit, if there isn't one
   - on the CronJob: `concurrencyPolicy: Forbid`, `backoffLimit: 0`, `activeDeadlineSeconds`
2. Deploy the new image built from this branch.

**Check it's working**

```bash
kubectl -n <NAMESPACE> port-forward deploy/ticketing-app 9464:9464 &
curl -s localhost:9464/metrics | grep ^ticketing_
kill %1
```

Counters show up after the first request that touches them. In Explore:
- `sum by (procedure, code) (rate(ticketing_trpc_requests_total[5m]))`
- Logs: `{job="ticketing-app"} | json`, and after the next expiry run,
  `{job="ticketing-expire-reserved"} | json | msg="expire-reserved run complete"`

## 6. Import the dashboard

Grafana → **Dashboards → New → Import** → upload `grafana-dashboard.json`.
Select the namespace at the top. The dashboard picks the
`grafanacloud-…-prom` and `grafanacloud-…-logs` data sources automatically.

## 7. Alerts

**Contact points** (Alerts & IRM → Alerting → Contact points):
- `slack`: a Slack incoming webhook (Slack → Apps → Incoming Webhooks), or
  Discord or Telegram if you prefer.
- `email`: your address.

**Notification policy** (Alerting → Notification policies), on the default policy:
- Default contact point: `slack`
- Group by: `alertname`, `pod`
- Add a nested policy matching `severity = critical` → contact point `email`
  with **Continue matching** on, so critical alerts go to both.
- Repeat interval: 4h.

**Rules:** create the 13 rules in `alerts.md`. Then test one: delete an app
pod (`kubectl delete pod …`). Alert #3 should reach Slack within about 2 minutes.

## 8. Staying inside the free tier

The free tier allows 10k active metric series, 50 GB of logs a month and 14
days of retention. A 2–3 node cluster with this setup should come to roughly
2–4k series and a few GB of logs a month.

Check under **Administration → Cost management → Usage** (or the "Billing/Usage"
dashboard) after a day. If series climb:
- **Adaptive Metrics** (Cost management) suggests unused series to drop.
- In `k8s-monitoring-values.yaml`, set `hostMetrics.enabled: false` (saves
  ~200 series per node) or add `excludeNamespaces` to `podLogsViaLoki`.
- Never add per-order or per-user labels to app metrics; put those in logs.

---

## Reference

**App metrics** (all on `:9464/metrics`; `job="ticketing-app"`)

| Metric | Labels | Meaning |
|---|---|---|
| `ticketing_trpc_requests_total` | procedure, type, code | every tRPC call; code `OK` or tRPC error code |
| `ticketing_trpc_request_duration_seconds` | procedure, type | histogram |
| `ticketing_orders_reserved_total` | | stock held, awaiting payment |
| `ticketing_order_reservation_failures_total` | reason=`out_of_stock`\|`paypal_error` | |
| `ticketing_orders_confirmed_total` | | paid |
| `ticketing_tickets_sold_total` | | tickets in paid orders |
| `ticketing_revenue_total` | currency | value of paid orders |
| `ticketing_order_capture_failures_total` | stage=`confirm`\|`payment`\|`post_capture` | see alerts #7 and #9 |
| `ticketing_orders_cancelled_total` | | admin cancellations |
| `ticketing_paypal_requests_total` | operation, outcome | |
| `ticketing_paypal_request_duration_seconds` | operation | histogram |
| `ticketing_emails_total` | outcome=`sent`\|`failed` | |
| `process_*`, `nodejs_*` | | Node.js runtime (heap, event loop lag, GC) |

**Useful log queries**

```logql
# everything about one order (works for orderId, eventId, paypalOrderId)
{job=~"ticketing-.*"} | json | orderId="<id>"

# errors with their stack traces
{job="ticketing-app"} | json | level="error"

# lines not from the app logger: Next.js internals, PayPal SDK, crash output
{job="ticketing-app"} !~ "^\\{"
```

**Environment variables**

| Var | Default | |
|---|---|---|
| `METRICS_PORT` | `9464` in production, off otherwise | `0` disables the metrics server |
| `LOG_LEVEL` | `info` (`silent` in tests) | `debug` for more detail |
