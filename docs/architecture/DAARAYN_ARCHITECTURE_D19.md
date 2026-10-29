# Daarayn architecture diagrams (D19) — reflect the code as implemented on 2026-10-30

Rendered by any Mermaid viewer (GitHub, VS Code preview). Solid arrows exist in the code today; dashed arrows are owner-dependent and NOT operational yet (noted in the legend).

## 1. Admin architecture

```mermaid
flowchart TB
  subgraph Admin["Authenticated Admin Panel (Firebase identity, server-side authorization)"]
    P["Programs (one navigation entry)"]
    P --> M["Masjid Infrastructure<br/>template: project, needs, verified-update hold"]
    P --> H["Qur'an Hifz<br/>category: hifz (endowment template default)"]
    P --> G["General Causes<br/>category: general (relief / custom)"]
  end
  M --> Repo
  H --> Repo
  G --> Repo
  Repo["Server repositories + write guard<br/>(approved-target allowlist, append-integrity protocols)"]
  Repo --> Sheets[("Google Sheets — sole operational source of truth<br/>Causes, Program_Content (programCategory), Program_Images, Donations, Donors,<br/>Donation_Causes, Allocations, Communications, Audit_Log, Realtime_Events")]
  Repo --> Drive[("Google Drive — application-managed media and evidence")]
  Sheets --> Core
  subgraph Core["Shared Daarayn core"]
    D["Donations, designations, allocations, reversals"]
    C["CRM / donor identity (permanent Donor Token)"]
    Com["Communications (approval-bound, per-recipient outcomes)"]
    R["Dashboard, reports, reconciliation"]
    A["Audit log and recovery"]
  end
  Repo -- "after a successful save: revalidate public pages,<br/>drop catalog and statistics caches, publish realtime event" --> Pub["Public website"]
  Core --> SSE["SSE / realtime (admin and agents only)"]
```

Category, template, lifecycle, publication and eligibility are independent fields:
`programCategory` (masjid | hifz | general) is stored in `Program_Content` and chooses the admin experience and public listing; `template` (relief | endowment | project | custom) chooses the page sections; lifecycle status (Draft, Active, Urgent, Completed, Inactive) lives on the cause; only Active and Urgent are public; the donation service re-reads eligibility (and the Masjid hold) from Sheets on every request. The Masjid-only update hold applies to the project template only.

## 2. Public user architecture

```mermaid
flowchart LR
  V["Public website visitor"] --> Disc["Discover programs<br/>(home page: three category carousels)"]
  Disc --> CM["Masjid carousel / View All → /masjid-projects"]
  Disc --> CH["Qur'an Hifz carousel / View All → /quran-hifz"]
  Disc --> CG["General Causes carousel / View All → /general-causes"]
  CM --> Detail["Program detail (shared template)<br/>/programs/[id]"]
  CH --> Detail
  CG --> Detail
  Detail --> Pay["Donation form (/pay)"]
  Pay --> Elig{"Server re-checks eligibility<br/>(status, Masjid hold, cause exists)"}
  Elig -- refused --> Err["Honest error, nothing recorded"]
  Elig -- accepted --> Sheets[("Google Sheets records<br/>donation PENDING, designation, donor")]
  Sheets --> Conf["Confirmation (recorded state, not verified payment)"]
  Sheets --> Ver["Admin verification → allocations → approved communications"]
  Ver --> Portal["Donor portal (one-time code, own records only)"]
  Stats["Public statistics<br/>/api/public/stats (counts only)"] -.-> Home["Home page trust cards"]
```

Notes: carousels show the first 12 published programs of a category in the administrator's order; arrow clicks only scroll cards already loaded (no Sheets call); View All pages list every published program of the category. Public data is cached (30 s data cache, tag-revalidated on every admin save, bounded staleness 10 minutes); statistics are cached 30 s and refreshed by the open page every 60 s while visible. Dashed/owner-dependent items: public hosting on `daaraynorg.com`, Google OAuth production status, production worksheets (migration blocked).
