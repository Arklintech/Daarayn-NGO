# Sheets and Drive reliability (2026-10-27)

## Measured Sheets API requests per operation
Counted at the Google REST level against a fake of the Sheets API with the real `lib/google/sheets.ts` (`tests/sheets-quota.test.ts`, prints `[API COUNT]`). Google's default quota is 60 read and 60 write requests per minute per user; the whole app shares one service account.

| Operation | Before (reads / writes) | After (reads / writes) |
|---|---|---|
| First donation on a cold instance (creates 6 tabs) | 22 / 28 | 7 / 20 |
| Repeat donation, warm instance | 7 / 8 | 4 / 7 |
| Admin verification | 1 / 3 | 1 / 3 |

What changed: header writes no longer clear first (-6 writes cold); tab list fetched once per instance; new notification/audit rows are appended without an existence read (`BaseRepository.append`); the donor and donation rows are updated at the row number just read (no re-read); the 2-3 realtime events of one donation go to the log in one append (`publishBatch`).
Remaining writes per warm donation (7): placeholder row, final donation row, donor history, notification, audit, realtime batch, email status. The placeholder+final pair is what makes Donation IDs collision-safe, so it stays.

## Retry policy (`lib/google/retry.ts`)
Bounded (5 attempts), exponential backoff with full jitter, cap 30 s, honours `Retry-After` (capped). Retried: 429, 500, 502, 503, 504, 403 rate/quota reasons, network resets/timeouts. Never retried: 400, 401, 403 permission, 404. Appends and Drive creates are retried **only on quota errors** (Google rejects those before applying them); an ambiguous 5xx/timeout on an append is not retried because it could have written the row. After the last attempt the original error is thrown, so nothing reports false success.

## Partial-write and concurrency behaviour (and what remains)
- Interrupted donation: a `PENDING` placeholder row is left, visible in Donations. A retry with the same `submissionKey` is told "in progress" for 20 s, then adopts and finishes that same row (no duplicate). Tested.
- Same-key concurrent submissions: one finished donation; losers wait for the winner and never return a placeholder. Tested.
- Distinct donors concurrently: unique Donation IDs and Donor Tokens. Tested (fake API with jitter).
- **Remaining risks:** (1) post-donation side effects (donor history, notification, audit, realtime, email status) are separate writes; a crash after the donation row is final leaves a valid donation without them, and a retry returns "duplicate" without redoing them. (2) Donor history update is read-modify-write (last write wins on that informational field). (3) Sheets has no transactions; ID uniqueness relies on verify-after-write, not a lock. (4) A cold start with many instances can still approach the 60 writes/minute limit; retry smooths bursts but cannot raise the quota. (5) Failed donation attempts can leave a blank (cleared) row; harmless to readers.

## Google Drive OAuth lifecycle
- Tokens stay server-side (encrypted `_Secrets` tab in production with `DRIVE_TOKEN_ENCRYPTION_KEY`, git-ignored `.secrets/` locally). Access tokens refresh automatically from the refresh token.
- Revoked/expired authorisation (`invalid_grant`): uploads fail with "reconnect Google Drive" (never a local save); the media route returns 503 `DRIVE_REAUTH_REQUIRED`; Settings shows "not connected".
- **Consent screen is in Testing status.** Google expires refresh tokens after 7 days for such apps with the Drive scope. The connection made on 2026-10-26 should lapse about 2026-11-02. Settings now shows the reconnect-by date (`GOOGLE_OAUTH_PUBLISHING_STATUS`, default `testing`). Long-term options (need your decision, not done): publish the consent screen to Production (requires Branding URLs; the `drive` scope is restricted, so Google may require app verification for external users; an "Internal" user type is only available to a Google Workspace organisation), or accept re-authorising weekly. Do not broaden scopes.
