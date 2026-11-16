#!/usr/bin/env python3
"""
Creates (or updates) the cluster's alert rules in Grafana Cloud in one go.

Rules are Grafana-managed. Each app gets its own folder and evaluation group
(every 1m): "ticketing" and "greatdj". They route through your notification
policies by their `severity` label. They are created with X-Disable-Provenance so they stay
editable in the UI. Re-running updates the rules in place (stable UIDs).

Usage:
  python3 deploy/monitoring/provision_alerts.py --url https://<stack>.grafana.net \
      --token-file ~/.grafana-alerts-token [--dry-run]

The token is a Grafana service account token (role Admin) — see README.
Rule definitions mirror alerts.md; the uptime check (#1) is configured in
Synthetic Monitoring instead.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

NS = "default"

# (uid, title, datasource, query, op, threshold, for, severity, no_data, summary, description)
RULES = [
    ("ticketing-no-ready-pods", "Ticketing: app has no ready pods", "prom",
     f'sum(kube_deployment_status_replicas_available{{namespace="{NS}", deployment="ticketing-deployment"}})',
     "lt", 1, "2m", "critical", "Alerting",
     "Ticketing app has no available replicas",
     "The site is down or restarting. Check `kubectl -n default get pods -l app=ticketing`."),
    ("ticketing-restarts", "Ticketing: container restarted", "prom",
     f'sum by (pod, container) (increase(kube_pod_container_status_restarts_total{{namespace="{NS}", pod=~"ticketing-.*"}}[10m]))',
     "gt", 0, "0s", "warning", "OK",
     "{{ $labels.pod }} restarted",
     "Check the reason (OOMKilled = hit memory limit, Error = crash) on the dashboard or with kubectl describe pod."),
    ("ticketing-memory-high", "Ticketing: memory near limit", "prom",
     f'max by (pod) (container_memory_working_set_bytes{{namespace="{NS}", container="ticketing"}}) / '
     f'max by (pod) (kube_pod_container_resource_limits{{namespace="{NS}", container="ticketing", resource="memory"}})',
     "gt", 0.9, "10m", "warning", "OK",
     "{{ $labels.pod }} is above 90% of its memory limit",
     "It will be OOMKilled if it reaches the limit. Raise the limit or look for a leak."),
    ("ticketing-ingress-5xx", "Ticketing: high 5xx rate at ingress", "prom",
     'sum(rate(traefik_service_requests_total{service=~".*ticketing.*", code=~"5.."}[5m])) / '
     'sum(rate(traefik_service_requests_total{service=~".*ticketing.*"}[5m]))',
     "gt", 0.05, "5m", "critical", "OK",
     "More than 5% of ticketing requests are failing with 5xx",
     "Check the app logs: {job=\"ticketing-app\"} | json | level=\"error\""),
    ("ticketing-api-errors", "Ticketing: server errors in API", "prom",
     f'sum by (procedure) (increase(ticketing_trpc_requests_total{{namespace="{NS}", code="INTERNAL_SERVER_ERROR"}}[5m]))',
     "gt", 0, "0s", "critical", "OK",
     "tRPC {{ $labels.procedure }} is returning INTERNAL_SERVER_ERROR",
     "Details in logs: {job=\"ticketing-app\"} | json | level=\"error\""),
    ("ticketing-payment-failures", "Ticketing: payment failures", "prom",
     f'sum by (stage) (increase(ticketing_order_capture_failures_total{{namespace="{NS}", stage=~"payment|post_capture"}}[15m]))',
     "gt", 0, "0s", "critical", "OK",
     "Payment failure at stage {{ $labels.stage }}",
     "payment = PayPal capture failed (order cancelled, tickets released). "
     "post_capture = CUSTOMER WAS CHARGED but saving details failed: check manually."),
    ("ticketing-paypal-errors", "Ticketing: PayPal API errors", "prom",
     f'sum by (operation) (increase(ticketing_paypal_requests_total{{namespace="{NS}", outcome="error"}}[10m]))',
     "gt", 2, "0s", "warning", "OK",
     "PayPal {{ $labels.operation }} calls are failing",
     "Sustained errors usually mean PayPal is down or credentials changed."),
    ("ticketing-paid-after-expiry", "Ticketing: paid after reservation expired", "prom",
     f'sum(increase(ticketing_order_capture_failures_total{{namespace="{NS}", stage="confirm"}}[1h]))',
     "gt", 2, "0s", "warning", "OK",
     "Customers finishing checkout after their reservation expired",
     "A few are normal; a cluster means the 5-minute hold is too short or PayPal is slow."),
    ("ticketing-email-failures", "Ticketing: confirmation emails failing", "prom",
     f'sum(increase(ticketing_emails_total{{namespace="{NS}", outcome="failed"}}[30m]))',
     "gt", 0, "0s", "warning", "OK",
     "Confirmation emails are failing to send",
     "Check Mailjet credentials/quota. Logs: {job=\"ticketing-app\"} | json | msg=\"failed to send email\""),
    ("ticketing-expiry-not-running", "Ticketing: expiry job not running", "prom",
     f'time() - max(kube_cronjob_status_last_successful_time{{namespace="{NS}", cronjob="ticketing-expire"}})',
     "gt", 900, "0s", "critical", "Alerting",
     "Reservation expiry job hasn't succeeded in 15+ minutes",
     "Reserved tickets aren't being released. Check `kubectl -n default get jobs` and the job logs."),
    ("ticketing-expiry-errors", "Ticketing: expiry job errors", "logs",
     f'sum(count_over_time({{namespace="{NS}", job="ticketing-expire-reserved"}} | json | level="error" [10m]))',
     "gt", 0, "0s", "critical", "OK",
     "Reservation expiry job logged errors",
     "Logs: {job=\"ticketing-expire-reserved\"} | json | level=\"error\""),
    ("ticketing-error-log-spike", "Ticketing: error log spike", "logs",
     f'sum(count_over_time({{namespace="{NS}", job="ticketing-app"}} | json | level="error" [5m]))',
     "gt", 10, "0s", "warning", "OK",
     "More than 10 error log lines in 5 minutes",
     "Logs: {job=\"ticketing-app\"} | json | level=\"error\""),
]

GREATDJ_RULES = [
    ("greatdj-heap-oom", "greatdj: server ran out of memory", "logs",
     f'sum(count_over_time({{namespace="{NS}", job="greatdj"}} |= "heap out of memory" [10m]))',
     "gt", 0, "0s", "warning", "OK",
     "greatdj server hit its heap limit and restarted",
     "Node wrote a heap snapshot to /diag in the pod (survives the container restart, "
     "not pod deletion). Copy it before redeploying: "
     "kubectl exec <pod> -c server -- ls /diag; kubectl cp <pod>:/diag/<file> -c server ./"),
]

# (folder/group title, app label, rules)
GROUPS = [
    ("ticketing", "ticketing", RULES),
    ("greatdj", "greatdj", GREATDJ_RULES),
]


class Grafana:
    def __init__(self, url, token):
        self.url = url.rstrip("/")
        self.token = token

    def req(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.url + path, data=data, method=method)
        r.add_header("Authorization", f"Bearer {self.token}")
        r.add_header("Content-Type", "application/json")
        for k, v in (headers or {}).items():
            r.add_header(k, v)
        try:
            with urllib.request.urlopen(r, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:500]}")


def pick_datasources(gf):
    ds = gf.req("GET", "/api/datasources")
    prom = [d for d in ds if d["type"] == "prometheus" and d["name"].endswith("-prom")]
    logs = [d for d in ds if d["type"] == "loki" and d["name"].endswith("-logs")]
    if len(prom) != 1 or len(logs) != 1:
        names = [(d["name"], d["type"]) for d in ds]
        sys.exit(f"Could not pick exactly one -prom and one -logs data source from: {names}")
    return {"prom": prom[0], "logs": logs[0]}


def ensure_folder(gf, title):
    for f in gf.req("GET", "/api/folders?limit=1000"):
        if f["title"] == title:
            return f["uid"]
    return gf.req("POST", "/api/folders", {"title": title})["uid"]


def build_rule(r, ds, folder_uid, group, app):
    uid, title, src, expr, op, thr, for_, sev, nodata, summary, desc = r
    d = ds[src]
    window = 3600 if "[1h]" in expr else 900
    query_model = {"refId": "A", "expr": expr, "intervalMs": 1000, "maxDataPoints": 43200}
    if src == "prom":
        query_model.update({"instant": True, "range": False})
    else:
        query_model.update({"queryType": "instant"})
    return {
        "uid": uid,
        "title": title,
        "folderUID": folder_uid,
        "ruleGroup": group,
        "condition": "C",
        "for": for_,
        "noDataState": nodata,
        "execErrState": "Error",
        "labels": {"severity": sev, "app": app},
        "annotations": {"summary": summary, "description": desc},
        "data": [
            {"refId": "A", "datasourceUid": d["uid"],
             "relativeTimeRange": {"from": window, "to": 0}, "model": query_model},
            {"refId": "B", "datasourceUid": "__expr__",
             "model": {"refId": "B", "type": "reduce", "expression": "A",
                       "reducer": "last", "settings": {"mode": "dropNN"}}},
            {"refId": "C", "datasourceUid": "__expr__",
             "model": {"refId": "C", "type": "threshold", "expression": "B",
                       "conditions": [{"evaluator": {"type": op, "params": [thr]}}]}},
        ],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--token-file", default="~/.grafana-alerts-token")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if a.dry_run:
        fake = {"prom": {"uid": "PROM_UID", "name": "x-prom"}, "logs": {"uid": "LOGS_UID", "name": "x-logs"}}
        for group, app, rules in GROUPS:
            body = {"title": group, "interval": 60,
                    "rules": [build_rule(r, fake, "FOLDER_UID", group, app) for r in rules]}
            print(json.dumps(body, indent=2))
        return

    token = open(os.path.expanduser(a.token_file)).read().strip()
    gf = Grafana(a.url, token)
    ds = pick_datasources(gf)
    print(f"data sources: {ds['prom']['name']}, {ds['logs']['name']}")
    for group, app, rules in GROUPS:
        folder = ensure_folder(gf, group)
        body = {"title": group, "interval": 60,
                "rules": [build_rule(r, ds, folder, group, app) for r in rules]}
        gf.req("PUT", f"/api/v1/provisioning/folder/{folder}/rule-groups/{group}", body,
               headers={"X-Disable-Provenance": "true"})
        got = gf.req("GET", f"/api/v1/provisioning/folder/{folder}/rule-groups/{group}")
        print(f"folder/group '{group}' ({folder}) now has {len(got.get('rules', []))} rules:")
        for r in got.get("rules", []):
            print(f"  - [{r['labels'].get('severity')}] {r['title']}")


if __name__ == "__main__":
    main()
