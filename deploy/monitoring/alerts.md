# Alert rules

**Rules 2–13 are created by a script**, not by hand:

```bash
python3 deploy/monitoring/provision_alerts.py \
  --url https://keenmole1238.grafana.net --token-file ~/.grafana-alerts-token
```

It needs a Grafana service account token (role Admin) saved in the token file.
It creates folder `ticketing` and evaluation group `ticketing` (every 1m),
and re-running it updates the rules in place. The rules stay editable in the
UI, but the script's definitions in `provision_alerts.py` are the source of
truth: if you change a rule in the UI, re-running the script overwrites it.

The rest of this file explains each rule. To create one manually instead, go
to **Alerts & IRM → Alerting → Alert rules → New alert rule**.
For each one, pick the data source shown, paste the query, and set the condition
and pending period from the table. Put them all in one folder (e.g. `ticketing`)
and one evaluation group that runs **every 1m**.

The queries use this cluster's names: namespace `default`, Deployment
`ticketing-deployment`, container `ticketing`, CronJob `ticketing-expire`.
Other apps share the `default` namespace, so rule #3 is scoped to the
ticketing pods with `pod=~"ticketing-.*"`.

Contact point and notification policy setup is in the README (step 7).

| # | Alert | Severity | Source | Fires when | Pending |
|---|---|---|---|---|---|
| 1 | Site down | critical | Synthetic Monitoring | uptime check fails | built in |
| 2 | App has no ready pods | critical | metrics | 0 available replicas | 2m |
| 3 | Container restarted / OOMKilled | warning | metrics | any restart in 10m | 0 |
| 4 | Memory near limit | warning | metrics | > 90% of limit | 10m |
| 5 | Ingress 5xx rate | critical | metrics | > 5% of requests | 5m |
| 6 | Server errors in API | critical | metrics | any `INTERNAL_SERVER_ERROR` | 0 |
| 7 | Payment failures | critical | metrics | any capture or post-capture failure | 0 |
| 8 | PayPal API errors | warning | metrics | > 2 errors in 10m | 0 |
| 9 | Paid after reservation expired | warning | metrics | > 2 in 1h | 0 |
| 10 | Confirmation emails failing | warning | metrics | any failure in 30m | 0 |
| 11 | Expiry job not running | critical | metrics | no successful run in 15m | 0 |
| 12 | Expiry job errors | critical | logs | an error line in 10m | 0 |
| 13 | Error log spike | warning | logs | > 10 error lines in 5m | 0 |

**Severity** is a label (`severity=critical|warning`) you add on each rule; the
notification policy in the README uses it to decide how loudly to notify.

For rules with "0" pending, set the pending period to `0s` so they fire on the
first bad evaluation. For "no data" handling, set **Alert state if no data →
OK** on every rule except #11 (see its note).

---

## 1. Site down

Not a rule: create a **Synthetic Monitoring → HTTP check** on
`https://ticketing.ruiramos.com/api/health?db=1` from 3 probe locations (e.g. London,
Frankfurt, Paris) **every 2m**, and turn on the check's alerting. It tests the
whole path: DNS, TLS, Traefik, the app and its database.

Every 2 minutes from 3 locations is ~65k checks a month, comfortably inside the
free tier's Synthetic Monitoring allowance (~100k). Every 1 minute from 3
locations would go over it.

## 2. App has no ready pods

```promql
sum(kube_deployment_status_replicas_available{namespace="default", deployment="ticketing-deployment"})
```
Condition: `< 1`, pending 2m.

## 3. Container restarted / OOMKilled

```promql
sum by (pod, container) (
  increase(kube_pod_container_status_restarts_total{namespace="default", pod=~"ticketing-.*"}[10m])
)
```
Condition: `> 0`. Covers both the app and the CronJob pods (`ticketing-deployment-…` and `ticketing-expire-…`). Add this to the
rule's description so the notification says *why*:

```promql
max by (pod, container, reason) (
  kube_pod_container_status_last_terminated_reason{namespace="default", pod=~"ticketing-.*"}
)
```
(`reason="OOMKilled"` means it hit its memory limit; `Error` means it crashed.)

## 4. Memory near limit

```promql
max by (pod) (container_memory_working_set_bytes{namespace="default", container="ticketing"})
/
max by (pod) (kube_pod_container_resource_limits{namespace="default", container="ticketing", resource="memory"})
```
Condition: `> 0.9`, pending 10m. Only works once the pod has a memory limit.

## 5. Ingress 5xx rate

```promql
sum(rate(traefik_service_requests_total{service=~".*ticketing.*", code=~"5.."}[5m]))
/
sum(rate(traefik_service_requests_total{service=~".*ticketing.*"}[5m]))
```
Condition: `> 0.05`, pending 5m. On this cluster the app's Traefik service
label is `default-ticketing-service-3000@kubernetes`.

## 6. Server errors in API

```promql
sum by (procedure) (
  increase(ticketing_trpc_requests_total{namespace="default", code="INTERNAL_SERVER_ERROR"}[5m])
)
```
Condition: `> 0`. This catches errors inside batched tRPC requests, which the
ingress sees as HTTP 207 or 200. Details are in the logs:
`{job="ticketing-app"} | json | level="error"`.

## 7. Payment failures

```promql
sum by (stage) (
  increase(ticketing_order_capture_failures_total{namespace="default", stage=~"payment|post_capture"}[15m])
)
```
Condition: `> 0`.
- `payment`: PayPal refused or failed the capture; the order is cancelled and its tickets released.
- `post_capture`: **the customer was charged** but saving payer and transaction details failed. Needs a manual look.

## 8. PayPal API errors

```promql
sum by (operation) (
  increase(ticketing_paypal_requests_total{namespace="default", outcome="error"}[10m])
)
```
Condition: `> 2`. A sustained run of these usually means PayPal is down or
credentials changed.

## 9. Paid after reservation expired

```promql
sum(increase(ticketing_order_capture_failures_total{namespace="default", stage="confirm"}[1h]))
```
Condition: `> 2`. Customers finished PayPal checkout after their 5-minute hold
had expired. A few are normal; a cluster of them means the hold is too short
or PayPal is slow.

## 10. Confirmation emails failing

```promql
sum(increase(ticketing_emails_total{namespace="default", outcome="failed"}[30m]))
```
Condition: `> 0`.

## 11. Expiry job not running

```promql
time() - max(kube_cronjob_status_last_successful_time{namespace="default", cronjob="ticketing-expire"})
```
Condition: `> 900` (15 minutes; the job runs every 4). Set **Alert state if no data → Alerting** for
this one: no data means the CronJob is gone or the metric stopped arriving,
and either way reserved tickets aren't being released.

## 12. Expiry job errors

Data source: Loki.
```logql
sum(count_over_time({namespace="default", job="ticketing-expire-reserved"} | json | level="error" [10m]))
```
Condition: `> 0`. Covers a crash of the whole run and individual orders that
failed to expire (the run's summary line has `failed > 0`).

## 13. Error log spike

Data source: Loki.
```logql
sum(count_over_time({namespace="default", job="ticketing-app"} | json | level="error" [5m]))
```
Condition: `> 10`. A catch-all for errors none of the metric-based alerts cover.

---

## Other apps on the cluster

The same script also creates folder/group `greatdj`:

| Alert | Severity | Source | Fires when |
|---|---|---|---|
| greatdj: server ran out of memory | warning | logs | a `heap out of memory` line in 10m |

```logql
sum(count_over_time({namespace="default", job="greatdj"} |= "heap out of memory" [10m]))
```
The heap is capped at 384MB (see `infra/greatdj/greatdj_deployment.yml`), so a
runaway request restarts the server instead of eating the node's memory. The
past cause was `/sitemap.xml` loading every full playlist (the whole 1.2GB
collection), not a leak; that's fixed. If this fires, look at the requests
just before the crash: `kubectl logs deploy/greatdj-deployment -c server --previous`.

---

## Later, once you have a few weeks of data

- **Checkout looks broken**: during an on-sale, many reservations but no
  confirmations. Something like
  `sum(increase(ticketing_orders_reserved_total[30m])) > 10 and sum(increase(ticketing_orders_confirmed_total[30m])) == 0`.
  Tune the numbers to your real traffic first, or it'll be noisy.
- **Slow PayPal**: p95 of `ticketing_paypal_request_duration_seconds` above a
  few seconds.
