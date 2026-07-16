# Daarayn Enterprise Trust Operating System
## Production Readiness Audit — SOP & Audit Framework

**Status:** This is a hardening/audit phase, not a feature phase. No new feature work proceeds until this document's gating rule (Section A.5) is satisfied.

---

## LIMITATIONS — WHAT THIS DOCUMENT DOES AND DOES NOT GUARANTEE

- Nothing in this file catches a bug by existing in `AGENTS.md`. The error-catching only happens when someone actually executes the steps.
- **No audit, however thorough, can promise zero errors.**
- What this framework buys is a large reduction in *costly* categories of failure — security holes, silent data corruption, an AI action writing bad data to the Public Ledger.
- **The honest bar this document enforces is not "no errors." It is "no unresolved Critical or High finding before deploy"** (Section A.5, Section D).
- Re-running this checklist without actually executing the underlying tools does not re-verify anything.

---

## HOW TO USE THIS DOCUMENT

- **Section A (SOP)** — the *process*: when audits run, who runs them, how findings are triaged and gated.
- **Section B (Audit Framework)** — the *checklist*: what gets inspected, domain by domain, with pass criteria and tooling.
- **Section C (Report Template)** — the artifact every audit run produces.
- **Section D** — the definition of "production ready" this all rolls up to.

---

# SECTION A — STANDARD OPERATING PROCEDURE

## A.1 Trigger Points (When This Runs)

| Trigger | Audit Depth |
|---|---|
| Before any production deployment | Full audit (all of Section B) |
| Before merging a feature branch to main | Scoped audit — only modules touched by the change |
| Weekly, automated | Code quality, security scan, dependency scan (automatable subset) |
| Quarterly | Full audit + load/stress testing + disaster recovery drill |
| After any Critical/High incident | Root-cause-targeted audit of the affected module + adjacent dependencies |
| Before rotating any secret, API key, or provider (Firebase, Groq, SMTP) | Targeted audit of affected integration |

## A.2 Roles & Responsibilities

- **Implementer:** Runs the scoped audit before opening a PR. Cannot self-certify a Critical/High finding as resolved without a second check.
- **Reviewer:** Verifies audit findings and their fixes before approval. Owns the "Production Readiness Score" sign-off.
- **Incident owner:** For anything touching the Public Ledger, Donor CRM, or payment flows, a named owner must sign off.

## A.3 Procedure

1. **Scope the audit** — full platform, or the specific modules touched by the change.
2. **Run automated checks first** (lint, type-check, dependency scan, Lighthouse, Firebase rules test suite).
3. **Work through Section B checklists** for every module in scope.
4. **Log every finding** in the Section C template as you go.
5. **Classify severity** using the definitions in A.4.
6. **Apply the gating rule** (A.5).
7. **Re-audit only the fixed items** before sign-off.

## A.4 Severity Definitions

| Severity | Definition | Example |
|---|---|---|
| **Critical** | Causes data loss, financial/ledger inconsistency, security breach, or full outage | Firestore security rule allows unauthenticated write to Donations collection |
| **High** | Causes incorrect behavior or broken functionality for a subset of users, no data loss | Field Ops form silently fails to sync when offline queue exceeds N items |
| **Medium** | Degrades experience or performance but has a workaround | Dashboard slow to load with >1000 records, no pagination |
| **Low** | Cosmetic, inconsistent styling, non-blocking warning | ESLint warning on unused import |

## A.5 Gating Rule ⚠️

- **No new feature work merges or deploys while any Critical or High finding is open** in a module that PR touches.
- Medium/Low findings are tracked but do not block — they go into a backlog with an owner and target sprint.
- Any finding touching the **Public Ledger, payments, or beneficiary PII** is treated as **Critical by default** regardless of apparent severity, until proven otherwise.

## A.6 Cadence Summary

- **Continuous:** lint/type-check/build on every commit (CI)
- **Per-PR:** scoped audit of touched modules
- **Weekly:** automated security + dependency scan
- **Quarterly:** full manual audit + load test + DR drill

---

# SECTION B — AUDIT FRAMEWORK (CHECKLIST BY DOMAIN)

## B.1 Code Quality
- [ ] Zero TypeScript errors (`tsc --noEmit`)
- [ ] Zero ESLint errors; warnings triaged and either fixed or explicitly suppressed with reason
- [ ] No dead code or duplicate logic (`ts-prune` or equivalent)
- [ ] No circular dependencies (`madge --circular`)
- [ ] No unhandled promise rejections; every `async` call either awaited or explicitly `.catch()`-handled
- [ ] No render loops / unnecessary re-renders (React DevTools profiler pass)
- [ ] Bundle size within budget (see B.8)

## B.2 Firebase / Firestore
- [ ] All Firestore queries have supporting composite indexes
- [ ] Security Rules tested with the Firebase emulator against both allowed and denied scenarios
- [ ] Every `onSnapshot` listener has a corresponding cleanup (`unsubscribe`) on unmount
- [ ] No duplicate listeners on the same query across components
- [ ] Batch writes / transactions used for any multi-document update that must be atomic
- [ ] Offline persistence behavior verified
- [ ] Firestore Rules reviewed for beneficiary/donor PII field-level exposure, not just collection-level access

## B.3 AI Pipeline (MOMIN)
- [ ] Provider failover tested (Groq unavailable → graceful degradation, not a crash)
- [ ] Rate-limit and timeout handling verified with simulated slow/failed responses
- [ ] JSON response parsing has schema validation — malformed AI output never reaches downstream logic unchecked
- [ ] Retry logic has a max-attempts ceiling (no infinite retry loops)
- [ ] **Critical:** any MOMIN action that writes to the Public Ledger, adjusts donor/beneficiary records, or triggers a financial action must pass through a deterministic validation gate — the AI proposes, a non-AI rule/permission check confirms, before it's committed. No AI output should be trusted to write directly to financial or ledger state.
- [ ] Logging captures AI inputs/outputs for any action with financial or ledger impact, for auditability after the fact

## B.4 API Stability
- [ ] Every route validates input (schema validation, not just type hints)
- [ ] Every route has consistent error response shape
- [ ] Timeouts set on all outbound calls (Firebase, Groq, SMTP) — no call can hang indefinitely
- [ ] Rate limiting on public-facing endpoints (especially donation/auth endpoints)
- [ ] Authorization checked server-side on every route — never trust a client-side role check alone

## B.5 Security
- [ ] Route protection verified for both Admin and Field Agent roles — test as each role, not just as admin
- [ ] XSS: all user-generated content rendered as text, not raw HTML, unless explicitly sanitized
- [ ] CSRF protections in place on state-changing requests
- [ ] No API keys or secrets in client-side bundles (grep build output for known key patterns)
- [ ] File upload validation: type, size, and content-sniffed (not just extension-checked)
- [ ] Dependency/supply-chain scan (`npm audit`) with no unresolved Critical/High CVEs
- [ ] Secrets rotation policy documented and dated
- [ ] Payment fields isolated — tokenized/iframed, never touching raw card data in app state

## B.6 Data Integrity
- [ ] No orphan documents (e.g., a donation record referencing a deleted campaign)
- [ ] Referential consistency checked between Donor CRM, Donations, and Public Ledger
- [ ] IDs immutable once created — no logic path that regenerates or reassigns a document ID
- [ ] Backup strategy for Firestore data documented and tested

## B.7 Responsiveness
- [ ] Spot-check Public Website, Admin Panel, and Field Ops Portal at the standard breakpoint set
- [ ] No new component shipped without passing the Definition of Done from the responsive spec

## B.8 Performance
- [ ] Lighthouse score thresholds met (Performance ≥ 85, Accessibility ≥ 90) for key pages
- [ ] Images served in optimized/responsive formats
- [ ] Route-level code splitting in place
- [ ] Firestore read counts checked for N+1 query patterns

## B.9 Error Handling
- [ ] Every async operation has a user-facing fallback (no blank screens, no infinite spinners)
- [ ] Technical error detail logged, user sees a friendly message — never a raw stack trace in the UI
- [ ] React Error Boundaries in place

## B.10 Monitoring & Observability
- [ ] Application error tracking wired up (Sentry or equivalent) and actually receiving events — verify with a test error
- [ ] Firebase/API/AI failure rates visible on a dashboard
- [ ] Alerting configured for error-rate spikes
- [ ] On-call/escalation path defined

## B.11 Testing
- [ ] Unit test coverage on core business logic (allocation rules, ledger calculations)
- [ ] Integration tests for auth flows and permission boundaries
- [ ] E2E test for the critical path: donation → ledger entry → receipt
- [ ] Load test performed against expected peak traffic
- [ ] Post-deployment smoke test checklist in place

---

# SECTION C — AUDIT REPORT TEMPLATE

| # | Module | Issue | Severity | Root Cause | Recommended Fix | Owner | Status |
|---|---|---|---|---|---|---|---|
| 1 | | | Critical/High/Medium/Low | | | | Open/In Progress/Resolved/Verified |

**Production Readiness Score rubric:**
- Start at 100
- Each open Critical: **-25**
- Each open High: **-10**
- Each open Medium: **-3**
- Each open Low: **-1**
- **Score below 75, or any open Critical → not production ready, deployment blocked per Section A.5**

---

# SECTION D — DEFINITION OF "PRODUCTION READY"

A module or the platform as a whole is production ready only when:

1. Zero open Critical or High findings
2. Production Readiness Score ≥ 75
3. Monitoring is live and verified receiving real events
4. A rollback plan exists for the deploy — defined before, not during, an incident
5. Post-deployment smoke test has passed
6. This is documented — not assumed — in the audit report (Section C) with a named sign-off

---

## APPENDIX — SUGGESTED TOOLING

- **Code quality:** ESLint, TypeScript strict mode, `madge`, `ts-prune`
- **Security:** `npm audit`, Firebase emulator suite for Rules testing
- **Performance:** Lighthouse CI, bundle analyzer
- **Monitoring:** Sentry (or equivalent), Firebase Performance Monitoring
- **Testing:** Jest/Vitest (unit), Playwright/Cypress (E2E), k6 or Artillery (load testing)

---

**Reminder:** No new feature implementation begins until Section A.5's gating rule is satisfied for any module the new feature touches.
