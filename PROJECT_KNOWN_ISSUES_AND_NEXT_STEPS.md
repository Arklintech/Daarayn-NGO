# KNOWN ISSUES & NEXT STEPS (2026-10-17)

Severity order: security → financial integrity → donor communications → auth → realtime → functional. "Verified" = confirmed by reading current code (not by running the app).

## A. Verified defects in current code
| ID | Sev | Issue | Evidence |
|---|---|---|---|
| S1 | Critical | `/api/media/[fileId]` has no auth; serves any Drive file reachable by the service account (payment proofs, field evidence); 1-year public cache; failures masked as 200 SVG | `app/api/media/[fileId]/route.ts` |
| S2 | Critical | `/api/donor/lookup` unauthenticated: returns donor PII for any email/phone and creates donor rows for arbitrary input (spam/enumeration) | `app/api/donor/lookup/route.ts` |
| S3 | High | `/api/donor/dashboard?donorId=` unauthenticated IDOR (donor + donation history) | `app/api/donor/dashboard/route.ts` |
| S4 | High | `/api/admin/communications/ai-assist` unauthenticated, calls Anthropic API (cost abuse) and violates the no-AI decision | route file |
| S5 | High | Admin auth does not check `email_verified` or token revocation; Firebase self sign-up appears enabled (agents created via public signUp REST) → an unregistered allow-listed admin email could be claimed | `lib/server/auth.ts`, `field-agents/route.ts` |
| S6 | Med | `/api/donate` accepts any file type/size to Drive; in-memory per-instance rate limit; `/api/causes` GET may seed data | `donate/route.ts`, `rate-limiter.ts` |
| S7 | Med | Auth token cookie is JS-set, not HttpOnly; middleware only checks a presence cookie | `authCookies.ts`, `middleware.ts` |
| S8 | Med | `/api/donors` POST merges arbitrary client fields (incl. id/status) into donor records | `api/donors/route.ts` |
| S9 | Med | Hardcoded Sheet id/Drive folder id/Firebase public config fallbacks and a hardcoded local path; tracked junk files with possibly sensitive content (`audit_report.txt`, `transcript_matches.txt`, `data/*.json`, `FIREBASE_AUTH_DIAGNOSIS.md` contains the public web key) | repo root |
| F1 | High | Donation confirmation-email status is not persisted (not in headers/mapper) although commits claim it | `donationRepository.ts`, `donationService.ts` |
| F2 | High | `dispatch-updates` increments `emailsSent` without sending | route |
| F3 | High | Milestone automations never match (`selectedCauses` always empty) | `automations/route.ts`, `donationRepository.mapRowToEntity` |
| F4 | High | Notification DELETE never deletes the sheet row | `baseRepository.delete` |
| F5 | High | Read APIs (`dashboard`, `admin/donations`, `admin/notifications`) return success with empty/zero data on Sheets failure | those routes |
| F6 | High | Beneficiaries, FAQs, Settings are browser-localStorage only | admin pages |
| F7 | Med | Programs/Campaigns saved as Causes; extra fields dropped; dedicated repos unused | pages, `causeRepository` |
| C1 | High | Recipient resolution uses fuzzy keyword matching; pending donors receive progress-type mail only via general; "all" includes all donors; no excluded-recipient list; no per-recipient outcomes; communication type and cause ids not stored; send has no idempotency | `communication-resolver.ts`, `broadcast-worker.ts` |
| C2 | Med | History detail is `?id=` only; `/admin/communications/history/<id>` URLs have no route (404); history page and `generate` route have TypeScript errors; stale `.next` types | tsc |
| C3 | Med | `lib/db.ts` local JSON fallbacks, Drive `secure_fallback` local storage, field chat `/tmp` mirror contradict "Sheets/Drive only" and can fake success (a historical test saw proof ids `local_*`) | `lib/db.ts`, `drive.ts`, `chat/route.ts` |
| R1 | Med | Non-atomic ID allocation for Field_Reports and Field_Agents; donor create race | routes, `donationService` |
| R2 | Low | Realtime log grows without bound; every instance with clients polls Sheets | `eventLog.ts` |
| K1 | High | KHIZR/Khizr strings & AI route reintroduced after removal; `.env.local` holds `GROK_*`, `AI_PROVIDER` names | grep |

## B. Historical reports — current status
| # | Report | Status |
|---|---|---|
| 1,2,3 | confirmation/broadcast emails not arriving; SMTP vs inbox | Code records only SMTP acceptance; inbox delivery UNVERIFIED (BLOCKED: needs mailboxes/credentials) |
| 4,5 | history 500 / jest-worker crash | Original `[id]` page deleted; list/detail now one client page. Runtime behavior UNVERIFIED; typecheck FAILS |
| 6 | cause filtering excludes donors | Rewritten to be broad (now risk of over-inclusion); UNVERIFIED |
| 7 | CRM missing donation history | Email fallback added in `metrics.ts`; UNVERIFIED |
| 8,9 | DA006 duplicate / concurrency | New allocator exists; existing sheet data and concurrent behavior UNVERIFIED |
| 10,11 | donations/causes inconsistencies | shared metrics + `/api/causes`; UNVERIFIED |
| 12 | dashboard staleness | derived from snapshot; zero-fallback risk (F5) |
| 13 | SSE across devices | implemented via sheet log; UNVERIFIED |
| 14 | Firebase/agent auth failures | code consistent; credential/console state BLOCKED |
| 15 | Drive evidence | S1; local fallback C3; UNVERIFIED |
| 16 | mobile verification | NOT TESTED |
| 17 | Firestore migration | active routes clean; legacy `lib/db-sync.ts`, `server.js`, root scripts remain |
| 18 | KHIZR reappearing | CONFIRMED (K1) |

## C. Unconfirmed suspicions / open questions
Firebase console sign-up setting; whether a duplicate DA006 still exists; Sheets API quota behavior under SSE polling + 30 s caches; whether production env has `ADMIN_EMAILS`, `GOOGLE_*`, `SMTP_*`; whether Programs/Campaigns display correctly given dropped fields; what deployed commit is live.

## D. Recommended next actions (dependency order)
1. Security: put auth (or signed, expiring tokens) on `/api/media/[fileId]`, `/api/donor/*`, `ai-assist`; stop auto-creating donors on lookup; restrict `/api/donors` POST fields. Add `email_verified` + revocation check.
2. Remove KHIZR UI text and `ai-assist`; remove AI env names (user decision pending on removal scope).
3. Make read APIs fail loudly (non-200 / `error` surfaced) instead of zeros.
4. Fix type errors; confirm `next build` passes; decide on history URL form (`?id=` vs restore `[id]` route).
5. Persist email status on donations (add headers + mapper) or move to a separate delivery log; add per-recipient outcome rows for broadcasts; fix `dispatch-updates` and automations or disable them.
6. Fix notification delete; per-admin read state if required.
7. Define and test recipient rules per communication type; return excluded recipients and reasons.
8. Move Beneficiaries/FAQs/Settings to Sheets with APIs; wire Programs/Campaigns repos.
9. Remove local-file fallbacks that mask failures; harden ID allocation for reports/agents/donors.
10. Introduce automated tests (unit for `metrics`, `createWithUniqueId` concurrency against a test sheet, auth guards), then browser + multi-device SSE tests on a test spreadsheet/Drive/SMTP, before any deployment.
