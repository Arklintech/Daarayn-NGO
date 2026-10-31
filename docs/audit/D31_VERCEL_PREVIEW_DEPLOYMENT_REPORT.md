# D31.3 Vercel Preview deployment report

Status: the D29/D30/D31 code was NOT deployed to Vercel in this round. No Vercel CLI, no Vercel login and no deploy token exist on this machine, and publishing through Git would need a commit and push that were not authorised. Production was not touched.

## 1. Inspection (read-only, what was possible)
| Item | Result |
|---|---|
| Vercel CLI | not installed; `npx vercel` would need an interactive login that cannot be completed without the account owner |
| Credentials available | `VERCEL_OIDC_TOKEN` in `.env.local` expired on 2026-09-19 (checked by decoding the expiry only) and is a runtime identity token, not a deploy credential: NOT used |
| Project linkage | no `.vercel/` directory; the GitHub repository `Arklintech/Daarayn-NGO` is connected to a Vercel project named `daarayn-ngo` in the team `arklintech` (seen in the commit status of the D27 push) |
| Branches | `main` and `feat/daarayn-pre-release-hardening` exist on GitHub; the feature branch carries D26 to D27 only (HEAD `7e1068e`); D29, D30 and D31 are uncommitted locally |
| Existing Preview | `https://daarayn-m8bl1b2iu-arklintech.vercel.app` (deployment `dpl_AkvWwmyqzyeHPLtgJf1wLNtKmLK3`, built from `742e065`): it does NOT contain the limiter, priority, lease, probe or financial-activation code. Its Sheets-backed routes answered HTTP 500 in D27 and the cause (environment variables, logs) was not diagnosable without access |
| Production | no production alias answered (`daarayn-ngo.vercel.app` returned 404); the production branch and domains were not inspected (no access) |
| Environment variables, build settings, function region/runtime | NOT INSPECTED. Function region seen from a response header: `iad1` |

## 2. Repository validation before any deployment (this session)
See the final gates in `D32_FINAL_RELEASE_ACCEPTANCE_MATRIX.md` (numbers are filled from the actual runs). Findings relevant to deployment:
- **Intermittent build failure from Google Fonts**: `next build` fetches fonts from `fonts.googleapis.com` through `next/font/google`. In this session about one in three builds failed with "Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'" and passed on an immediate retry, with the network healthy. A Vercel build can hit the same fault and fail intermittently; a redeploy normally clears it. Permanent fix (not done, needs a design/legal check of the fonts): self-host the three fonts with `next/font/local`. Recorded as a release risk.
- The Sheets bypass guard, coordinator, allocation, priority, lease, activation and probe tests are part of the suite.

## 3. How to deploy the Preview (needs the account owner; nothing here is executed)
Option A (CLI, preferred by the directive: deploys the verified working tree, no commit or push):
1. `npm i -g vercel` then `vercel login` (account owner), `vercel link` to `arklintech/daarayn-ngo`.
2. Set the Preview environment variables (names in `D31_VERCEL_CONFIGURATION_RUNBOOK.md`) with `vercel env add NAME preview` (values typed or piped; never pasted into chat or Git).
3. `vercel deploy` (WITHOUT `--prod`) from the repository root; record the deployment id and URL it prints. Env changes only take effect on a NEW deployment.
Option B (Git): commit D29/D30/D31 on the feature branch and push it; the Git integration builds a Preview. Needs authorisation to commit and push; never push to `main`.
Safety: `vercel --prod`, merging to `main` and promoting a deployment are Production operations and are NOT part of this procedure.

## 4. Capture list for the deployment record (to be filled after the deployment)
Preview deployment id, Preview URL, source revision, build log excerpt, status, function region, the exact list of Preview variable NAMES set (no values). Currently: NOT AVAILABLE.

## 5. Status
Preview deployed: NO. Preview configured with the coordinator: NO. Preview verified: NO.
