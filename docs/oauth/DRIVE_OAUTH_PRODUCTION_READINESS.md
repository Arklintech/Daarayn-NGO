# Daarayn — Google Drive OAuth: leaving Testing mode (owner checklist)

Prepared 2026-10-29 from the repository and read-only diagnostics. It states what is verified, what is NOT, and the one next owner action. It does not change any Google Cloud setting.

## 1. What is verified today
| Fact | Evidence |
|---|---|
| OAuth client and service account are in the same Google Cloud project | live diagnostic (client project number matches) |
| The app asks for exactly one Drive scope: `https://www.googleapis.com/auth/drive` (restricted) | `lib/google/driveOAuth.ts`, live token info shows only `drive` granted |
| The stored refresh token works today | live diagnostic issued an access token |
| Consent screen: External, Testing (owner report) | owner; not readable by the app |
| "Reconnect by 5 Nov 2026 13:38" in the admin screen | the app's own estimate (connected time + 7 days); Google does not publish a token's real expiry |
| Public domain `daarayn.org` (used in the site's metadata and e-mail footer) | **does not resolve** (DNS lookup failed on 2026-10-29): no public site exists on it yet |
| Public pages | home page exists; a Privacy Policy page now exists at `/privacy` (new, linked from the footer and sitemap) |

## 2. Testing mode versus production versus Google's approval
- "In production" (publishing status) and "scope verified by Google" are different things. Publishing an external app that uses a restricted scope without verification is allowed but users see an "unverified app" warning and the app is limited to 100 users; the refresh token then stops expiring after 7 days, but Google may still require verification.
- The `drive` scope is RESTRICTED. Verification needs: a verified domain, a public homepage, a public privacy policy with the Google API Services "Limited Use" statement, an accurate justification for the scope, a demo video showing the consent flow and how each scope is used, and, for restricted scopes whose data is stored on a server, an independent security assessment (annual, paid, usually weeks to months). No one-day outcome should be promised.

## 3. Options (choose one)
| Option | Verification needed | Effort | Notes |
|---|---|---|---|
| **A. Narrow to `drive.file`** (non-sensitive scope) — code support is ready (`GOOGLE_DRIVE_SCOPE_MODE=file`) | none for the scope; basic branding only | small | The app can then reach only files it created. A new root folder is created BY the app (`POST /api/admin/google-drive/create-root`), files the same OAuth client already uploaded stay reachable, the old owner-made root folder does not. One re-authorisation. Recommended: quickest route out of Testing without a security assessment. Must be exercised once on test resources before production. |
| B. Keep full `drive` | full restricted-scope verification + security assessment | weeks to months | Needs the public domain, pages, video, assessment; Testing mode (weekly reconnect) continues until approved. |
| C. Google Workspace "Internal" app | none | small | Possible only if Daarayn has a Google Workspace organisation and the connecting account belongs to it. Not available for a personal Gmail account. |
| D. Stay in Testing | none | none | Not acceptable as the permanent state; the connection lapses every 7 days. |

## 4. What the repository now provides
- Public, accurate privacy page `app/privacy/page.tsx` (route `/privacy`) separate from `/admin`; footer link fixed (it pointed at `#about`); added to the sitemap. Contact address comes from `NEXT_PUBLIC_CONTACT_EMAIL` (default: the organisation mailbox the platform sends from) — confirm or change.
- Includes the Google user-data section (what is accessed, where, who sees it, no sale, no AI training, Limited Use statement).
- Scope mode switch and app-owned root folder endpoint (Option A), default unchanged.
- The page states the Drive token is stored encrypted: that is true only when `DRIVE_TOKEN_ENCRYPTION_KEY` is set on the server (base64 of 32 random bytes). Set it in production before publishing the policy.

## 5. Owner actions, in order (the first one blocks everything else)
1. **Establish a real public domain**: register or point a domain (the code assumes `daarayn.org`; it does not exist in DNS today) and deploy the public site on it. Deployment was not authorised in this session and was not done.
2. Verify the domain in Google Search Console with the Google account that owns the Cloud project, and add it under Google Auth Platform → Branding → Authorised domains.
3. Branding: app name, user-support email, developer contact email, logo (square PNG, max 1 MB), Application home page `https://<domain>/`, Privacy policy `https://<domain>/privacy`, optional Terms (the footer's Terms link is still a placeholder — do not submit a Terms URL until a real terms page exists).
4. Decide Option A, B or C. For A: set `GOOGLE_DRIVE_SCOPE_MODE=file`, remove `drive` from Data Access (add `drive.file`), reconnect once in Admin → Settings → Google Drive, call create-root, set `GOOGLE_DRIVE_ROOT_FOLDER_ID` to the returned id.
5. Change the OAuth client's redirect URI to `https://<domain>/api/admin/google-drive/callback` and set `GOOGLE_OAUTH_REDIRECT_URI` accordingly.
6. Set `DRIVE_TOKEN_ENCRYPTION_KEY` in production; create the missing `_Secrets` worksheet through the approved migration.
7. Click "Publish app" (Audience → In production), then set `GOOGLE_OAUTH_PUBLISHING_STATUS=production` so the admin screen stops showing the 7-day estimate.
8. Verify without sharing credentials: Admin → Settings → Google Drive shows Connected; upload one test image to a test program; open it on the public page; leave it a week and confirm the connection survives.

## 6. Single next owner action
Provide (or register) the public domain and deploy the public site there; everything else in Google Cloud depends on it.

## 7. Privacy policy wording and Google's requirements (update 2026-10-29)
By the owner's decision the public privacy page names no technology provider (no Google, Drive, Firebase, Gmail or Sheets) and has no Google "Limited Use" sentence. Consequence to decide before submitting anything to Google:
- Option A (`drive.file`, non-sensitive scope): the Limited Use statement is not required for a non-sensitive scope; the generic wording on the page is expected to be sufficient, but re-read the consent-screen requirements in the console when publishing.
- Option B (full `drive`, restricted scope): Google requires the privacy policy to state that use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements, and to describe the Google data accessed. The current page does NOT contain that sentence, so Option B would fail review until it is added back. Ready-to-use sentence: "Daarayn's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy (https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements."
- Section 4 of the page says information is held by "trusted service providers" without naming them; the page still says the connection token is protected — keep `DRIVE_TOKEN_ENCRYPTION_KEY` set in production so that remains true.


## 8. Domain facts (checked 2026-10-29) — update
The owner states `daaraynorg.com` is purchased. From this machine the name does NOT resolve (DNS lookup failed; no A/NS answer), so there is no hosting, no certificate and no reachable page yet. The intended URLs are `https://daaraynorg.com/` (home), `https://daaraynorg.com/privacy` (policy page, written, runs locally) and `https://daaraynorg.com/terms` (NOT prepared: the footer Terms link was a placeholder and has been removed until a genuine page exists; Google does not require a terms page for this consent screen). The site metadata, sitemap, robots and structured data now use `https://daaraynorg.com`. The footer shows the organisation mailbox `daaraynorg@gmail.com`; the invented placeholder phone number was removed; a mailbox on the new domain should replace it once it exists (set `NEXT_PUBLIC_CONTACT_EMAIL`).
Steps still required from the owner, in order: (1) choose a host and deploy this application (the code already detects Vercel); (2) add `daaraynorg.com` and `www` to the host and create the DNS records it prints at the registrar; wait for HTTPS; (3) in Google Search Console add the DOMAIN property and create the TXT record it gives you; (4) Google Auth Platform, Branding: fill the fields in section 11; (5) set the production environment variables listed in `docs/migration/PRODUCTION_SCHEMA_PREPARATION.md` section 5.

## 9. `drive.file` compatibility (code inspection; live proof NOT RUN)
| Workflow | Under `drive.file` | Change needed |
|---|---|---|
| Create evidence root | works (created by the app) | create it with `POST /api/admin/google-drive/create-root`, set `GOOGLE_DRIVE_ROOT_FOLDER_ID` |
| Create category sub-folders (list children by name, create if missing) | works inside an app-created root | none |
| Upload donation proofs, program and gallery images, allocation evidence, communication attachments | works (new files are app-created) | none |
| Read, stream, get metadata of files the app already uploaded (proof viewer, media route, gallery) | expected to work: Google grants per-file access to files created by the same OAuth client | CONFIRM live on isolated resources (not yet exercised) |
| Reorder and update gallery | metadata lives in the spreadsheet, no Drive call | none |
| Delete replaced or removed images | works for app-created files | none |
| Oversized-message download links | served by the app's own signed route, no Drive sharing | none |
| Existing hierarchy under the owner-created root folder | NOT reachable (the app did not create that folder) | one-time: new app-owned root; old files keep their ids and stay readable if app-created; anything a person placed in Drive by hand is NOT reachable and must be re-uploaded |
| Falling back to the broad scope when the narrow one fails | not implemented, on purpose | an authorisation failure is shown as "reconnect required", never as an empty success |

Live test procedure (owner consent required, isolated resources only): temporarily add `drive.file` under Data Access, set `GOOGLE_DRIVE_SCOPE_MODE=file` on the isolated server only, reconnect Drive once, call create-root, upload a proof and a gallery image through the isolated server, read both back through the media route (administrator) and anonymously (the proof must be refused, the gallery image served), then delete the gallery image. Until that passes, do not change the production scope.

## 10. Strategy comparison
| Option | Compatibility | Scope sensitivity | Verification / external dependency | Migration | Risk |
|---|---|---|---|---|---|
| 1. Existing OAuth app, `drive.file` | expected compatible (section 9) | non-sensitive | no restricted-scope review; publish to Production | new root folder; re-upload hand-placed files | unproven live; private evidence protection unchanged (app-served) |
| 2. Existing app, full `drive` | works today | restricted | verified domain, policy with Limited Use wording, justification, demo video, usually an annual independent security assessment | none | weeks to months; the policy must name Google's API policy (conflicts with the vendor-neutral policy) |
| 3. Separate production Cloud project | same code | same as the chosen scope | new consent screen and client, re-consent; does not remove the review | new client id and secret, redirect URIs | more moving parts; no benefit by itself |
| 4. Service account with a Shared Drive | service accounts have no storage quota in My Drive; a Shared Drive needs Google Workspace | n/a (no user consent) | Workspace subscription | move storage, add the service account as a member | operationally clean (no tokens, no 7-day expiry) but needs Workspace |

Recommendation: prove option 1 on isolated resources first (it is the only route that does not depend on a security assessment), keep option 2 as the fallback, consider option 4 only if the organisation has or will buy Workspace. Nothing is decided or changed without owner approval.

## 11. Branding and verification pack (prepared, nothing submitted)
| Field | Value to enter |
|---|---|
| App name | Daarayn Foundation |
| User support email / developer contact | an address the owner reads (the organisation mailbox `daaraynorg@gmail.com` today) |
| Logo | square PNG, at most 1 MB, from `public/icons/icon-512.png` (the owner approves the artwork) |
| Application home page | `https://daaraynorg.com/` (must be live, describe the Trust and link to the policy) |
| Privacy policy | `https://daaraynorg.com/privacy` (vendor-neutral by owner decision) |
| Authorised domains | `daaraynorg.com` (verified in Search Console) |
| Redirect URI | `https://daaraynorg.com/api/admin/google-drive/callback`; keep the localhost callback only on the test client |
| Scope justification (draft) | The organisation's administrators connect one Google account so the platform can store and retrieve the organisation's own files: payment-proof images uploaded by donors, program photographs and evidence of how funds were used. The platform does not access any donor's or visitor's Google data. |
| Data handling description (draft) | Files are stored in the organisation's own storage; private files are served only to signed-in administrators; only photographs approved for publication are public; the authorisation token is stored server-side, encrypted, and never sent to browsers; no sale, advertising or AI-model training; access can be revoked in the Google Account permissions page. |
| Demo video (if the restricted scope is kept) | sign-in to the administrator area, Settings, connect Drive, the consent screen with the scope visible, upload of a proof or photo, the file appearing, and revoking access |

Publishing status versus approval: pressing Publish only moves the app out of Testing; it is not a Google verification decision.

## 12. Privacy policy versus Google's mandatory wording
The page is vendor-neutral on purpose. Google's Limited Use sentence names the Google API Services User Data Policy; it is required only for sensitive and restricted scopes (option 2). Under option 1 the neutral text describing authorised account access, organisational files, access limits, no sale, advertising or AI training, retention and revocation is the expected disclosure; re-read the console checklist at submission. Under option 2 the owner must choose: add the one required sentence (a single provider name) or accept that the review will fail. The policy does not claim any approval or compliance status.
