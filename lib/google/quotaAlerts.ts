/**
 * Quota health evaluation (pure, no I/O). Thresholds are the D29 starting points and are meant to be calibrated from measured traffic:
 * 70 % of a configured budget = warning, 80 % = defer non-essential work, 90 % = critical (protect financial traffic), any HTTP 429 = incident,
 * coordinator loss or uncertain state = critical (the application already fails closed). This module only EVALUATES; routing an alert to a
 * person (Cloud Monitoring, Vercel, e-mail) is configured outside the code and is NOT active until verified (see docs/ops/D29_MONITORING_AND_ALERTING_RUNBOOK.md).
 */
import type { LimiterConfig } from "./requestControl";

export type Severity = "ok" | "warning" | "high" | "critical";
export interface QuotaAlert { code: string; severity: Severity; message: string; action: string }

export interface CoordinatorMetrics {
  storageOk: boolean;
  quarantined: boolean;
  rollingGranted60s: { read: number; write: number };
  queueDepthMs: { read: number; write: number };
  refusedSinceStart: { read: number; write: number };
  penaltiesSinceStart: number;
  storageFailuresSinceStart: number;
}

export interface QuotaHealthInput {
  config: LimiterConfig;
  /** null when the coordinator could not be reached (or none is configured). */
  coordinator: CoordinatorMetrics | null;
  coordinatorConfigured: boolean;
  /** this server instance's own counters (googleUsageSnapshot) */
  local: { total: { quotaRejections: number }; byKind: { read: number; write: number; retries: number; backpressure: number }; shed: Record<string, number> };
  /** donations or allocations whose outcome is uncertain (interrupted placeholders etc.), when known */
  uncertainFinancialOperations?: number;
}

const rank: Record<Severity, number> = { ok: 0, warning: 1, high: 2, critical: 3 };
export const worst = (alerts: QuotaAlert[]): Severity => alerts.reduce<Severity>((w, a) => (rank[a.severity] > rank[w] ? a.severity : w), "ok");

const utilisation = (used: number, perMinute: number) => (perMinute > 0 ? used / perMinute : 0);
const band = (u: number): Severity => (u >= 0.9 ? "critical" : u >= 0.8 ? "high" : u >= 0.7 ? "warning" : "ok");

export function evaluateQuotaHealth(i: QuotaHealthInput): QuotaAlert[] {
  const alerts: QuotaAlert[] = [];
  if (!i.coordinatorConfigured) {
    alerts.push({ code: "COORDINATOR_NOT_CONFIGURED", severity: "critical", message: "No shared request coordinator is configured.", action: "Configure the coordinator; production refuses Google requests without it." });
  } else if (!i.coordinator) {
    alerts.push({ code: "COORDINATOR_UNREACHABLE", severity: "critical", message: "The shared request coordinator did not answer.", action: "Follow the coordinator outage procedure; the application is failing closed." });
  } else {
    const c = i.coordinator;
    if (!c.storageOk) alerts.push({ code: "COORDINATOR_STATE_UNCERTAIN", severity: "critical", message: "The coordinator cannot persist its state.", action: "Check the disk; reservations are refused until it recovers." });
    if (c.quarantined) alerts.push({ code: "COORDINATOR_QUARANTINE", severity: "high", message: "The coordinator is holding all budgets after a state loss.", action: "Wait for the quarantine to end; investigate why state was lost." });
    for (const kind of ["read", "write"] as const) {
      const perMinute = kind === "read" ? i.config.readsPerMinute : i.config.writesPerMinute;
      const u = utilisation(c.rollingGranted60s[kind], perMinute);
      const b = band(u);
      if (b !== "ok") alerts.push({ code: `${kind.toUpperCase()}_UTILISATION_${Math.round(u * 100)}`, severity: b, message: `${kind} budget used at ${Math.round(u * 100)} % over the last 60 s.`, action: b === "critical" ? "Protect financial traffic; shed P2/P3 work; review request growth." : b === "high" ? "Defer non-essential work." : "Review the trend this week." });
      const depth = i.config.maxWaitMs > 0 ? c.queueDepthMs[kind] / i.config.maxWaitMs : 0;
      if (depth >= 0.5) alerts.push({ code: `${kind.toUpperCase()}_QUEUE_${Math.round(depth * 100)}`, severity: depth >= 0.8 ? "high" : "warning", message: `${kind} queue is ${Math.round(c.queueDepthMs[kind] / 1000)} s deep (limit ${Math.round(i.config.maxWaitMs / 1000)} s).`, action: "Requests will start being refused as busy; reduce load or schedule heavy work later." });
    }
    const projReads = utilisation(c.rollingGranted60s.read, i.config.projectReadsPerMinute ?? 0);
    const projWrites = utilisation(c.rollingGranted60s.write, i.config.projectWritesPerMinute ?? 0);
    for (const [kind, u] of [["read", projReads], ["write", projWrites]] as const) {
      const b = band(u);
      if (b !== "ok") alerts.push({ code: `PROJECT_${kind.toUpperCase()}_UTILISATION_${Math.round(u * 100)}`, severity: b, message: `project-level ${kind} budget used at ${Math.round(u * 100)} %.`, action: "Other services of the same Google project may share this quota; check all consumers." });
    }
    if (c.penaltiesSinceStart > 0) alerts.push({ code: "GOOGLE_429_GLOBAL", severity: "high", message: `${c.penaltiesSinceStart} Google quota penalty(ies) were reported to the coordinator since it started (any instance).`, action: "Treat as an incident: some instance received HTTP 429; find the cause; the shared cooldown is already active." });
    if (c.refusedSinceStart.read + c.refusedSinceStart.write > 0) alerts.push({ code: "REQUESTS_REFUSED", severity: "warning", message: "The coordinator refused requests that would have waited too long.", action: "Capacity is being reached; review traffic and priorities." });
  }
  if (i.local.total.quotaRejections > 0) alerts.push({ code: "GOOGLE_HTTP_429", severity: "high", message: `${i.local.total.quotaRejections} Google quota rejection(s) seen by this instance.`, action: "Treat as an incident: the shared budgets are too high or another consumer shares the quota." });
  const attempts = i.local.byKind.read + i.local.byKind.write;
  if (attempts >= 20 && i.local.byKind.retries / attempts > 0.1) alerts.push({ code: "RETRY_AMPLIFICATION", severity: "warning", message: `Retries are ${Math.round((100 * i.local.byKind.retries) / attempts)} % of attempts.`, action: "Find the failing call; retries consume the same quota." });
  const shed = Object.entries(i.local.shed || {}).reduce((n, [, v]) => n + v, 0);
  if (shed > 0) alerts.push({ code: "REQUESTS_SHED", severity: "warning", message: `${shed} request(s) were refused by priority shedding on this instance.`, action: "Check which priorities were refused; P0/P1 refusals mean capacity is exhausted." });
  if ((i.uncertainFinancialOperations ?? 0) > 0) alerts.push({ code: "UNCERTAIN_FINANCIAL_OPERATIONS", severity: "high", message: `${i.uncertainFinancialOperations} financial operation(s) are interrupted or uncertain.`, action: "Reconcile before completion (Admin > Reconciliation); never resume automatically." });
  return alerts;
}
