# SMTP, DONOR CRM & DONATION INTEGRITY ROOT-CAUSE REPORT
## Critical Findings from Code Investigation

**Date:** 2026-10-16  
**Status:** 🔴 **CRITICAL ISSUES IDENTIFIED**  
**Investigation Method:** Source code trace + execution path analysis

---

## ISSUE #1: EMAIL DELIVERY FAILURES SILENTLY SWALLOWED 🔴

### Root Cause

**Location:** `lib/services/donationService.ts:233-235`

```typescript
try {
  await sendDonationEmail({...});
} catch (emailErr: any) {
  console.error("[DonationService] Email send error:", emailErr.message);
  // ⚠️ NO RE-THROW - error is swallowed
  // ⚠️ NO RETURN - caller doesn't know it failed
  // ⚠️ NO PERSISTENCE - failure not recorded
}
```

### Evidence

1. **Error Not Returned:** The `processDonation` function returns `success: true` regardless of email status
   - Line 238: Returns `{ success: true, trackingId, donorId, ... }`
   - Email failure doesn't change this return value

2. **Error Not Persisted:** Failed emails are logged to console but not saved anywhere
   - No field in Donation record tracks email status
   - No entry in audit log documenting email failure
   - Admin can't see email status in donation details

3. **Error Not Propagated:** The /api/donate endpoint (app/api/donate/route.ts) calls donationService.processDonation()
   - It receives `success: true` even when email failed
   - Returns success to the user without verifying email delivery

4. **Silent Failure Pattern Repeated:** `lib/broadcast-worker.ts:126` has similar issue:
   ```typescript
   await sendEmail({...}).catch(err => console.error(...));
   ```
   Errors are caught and logged but not tracked

### Impact

- ✅ Donation IS persisted to Google Sheets
- ❌ Confirmation email FAILS SILENTLY
- ❌ User believes email was sent (API says success=true)
- ❌ Admin has no record of email failure
- ❌ NO EVIDENCE whether emails actually arrived

**This explains why the user said "expected emails did not arrive"** — the emails were failing, but the system reported success!

---

## ISSUE #2: NO EMAIL STATUS TRACKING IN DONATION RECORD 🔴

### Evidence

**Donation schema** (donationRepository):
```typescript
interface Donation {
  id: string;
  donorId: string;
  donorEmail: string;
  amount: number;
  currency: string;
  date: string;
  status: "pending" | "completed" | "rejected"; // ← Only donation verification status
  paymentMethod: string;
  donationType: string;
  causeId: string;
  causeTitle: string;
  proofDriveFileId: string;
  transactionReference: string;
  notes: string;
  selectedCauses: [];
  // ❌ MISSING: confirmationEmailSent: boolean;
  // ❌ MISSING: confirmationEmailSentAt?: string;
  // ❌ MISSING: confirmationEmailError?: string;
}
```

**Missing from schema:**
- Whether confirmation email was sent
- Timestamp of email send
- Error details if send failed

---

## ISSUE #3: ADMIN COMMUNICATIONS BROADCAST FAILURES NOT PROPERLY TRACKED 🔴

**Location:** `lib/broadcast-worker.ts:129-166`

While processBroadcast properly tracks sent/failed counts, there are two issues:

1. **Line 153:** Result of sendEmail is checked, but real-time progress doesn't distinguish between SMTP acceptance and actual mailbox delivery
2. **Result.success interpretation:** "success" means SMTP accepted the email, NOT that it arrived in inbox

### Evidence

From `lib/email/providers/gmail.ts:152`:
```typescript
console.log("[Gmail] Email accepted, MessageId:", info.messageId);
return {
  success: true,  // ← SMTP accepted only, not inbox delivery confirmed
  providerMessageId: info.messageId,
};
```

**The semantics are wrong:** SMTP acceptance (250 OK) is not the same as inbox delivery.

---

## ISSUE #4: DUPLICATE DA006 PREVENTING VERIFICATION 🔴 **ROOT CAUSE FOUND**

### Root Cause: Race Condition in ID Allocation

**File:** `lib/repositories/donationRepository.ts`

**The Problem:**
```typescript
// 1. Calculate next ID from CURRENT sheet state
let donation = build(nextDonationId(rows));  // Calculates DA006

// 2. Append row with that ID
const myRow = await sheetsService.appendRow(this.sheetName, toRow(donation), DONATION_HEADERS);

// 3. THEN retry if collision (too late - already appended)
for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
  ({ rows } = await sheetsService.getRowsWithNumbers(this.sheetName));
  // If other concurrent submission already used DA006, update ours to DA007
  // But the earlier submission keeps DA006!
}
```

**Race Condition:**
1. Request A calculates nextDonationId() → DA006
2. Request B calculates nextDonationId() → DA006 (same calculation, both see same max)
3. Request A appends row with DA006
4. Request B appends row with DA006
5. Request A's retry detects collision, updates to DA007
6. Request B's retry also detects collision, updates to DA007 (overwrites A's data!)
7. Result: TWO rows with DA006, both broken

**Why It's Critical:**
- `findSingleRow(id)` throws error when ID appears >1 time
- Admin can't verify or reject either DA006 donation
- Financial records become ambiguous

### Evidence

From code:
- Line: `let donation = build(nextDonationId(rows));` — ID calculated BEFORE append
- No row-level lock preventing concurrent ID generation
- Two concurrent requests can both calculate the same ID before either appends

---

## ISSUE #5: DONOR CRM MISSING DONATION INFORMATION 🟡

### Evidence

From the user's report: "Donors appear in Donor CRM, but their donation information is missing or incorrectly linked."

**Possible causes:**

1. **Donation query filtering:** Donor CRM queries might filter out pending donations
2. **Relationship linking:** donationHistory array might not be populated correctly
3. **Repository join logic:** getDonationHistory might use wrong field for matching

**File to investigate:** Need to check donor profile page query logic

---

## FIXES REQUIRED (PRIORITY ORDER)

### FIX #1: Proper Email Error Handling in DonationService ✅ DONE

**Commits:** 10be4e3, 8f1b212
- Email errors now caught and persisted
- Status returned to API caller
- Admin can see email delivery status

### FIX #2: Add Email Status Fields to Donation ✅ DONE

**Commits:** 10be4e3, 8f1b212
- confirmationEmailSent: boolean
- confirmationEmailSentAt: timestamp
- confirmationEmailError: error message
- confirmationEmailRetryCount: for retries

### FIX #3: Fix SMTP Semantics in Broadcast ✅ DONE

**Commit:** 8a77a35
- Clarified SMTP acceptance vs inbox delivery
- Added explicit logging about semantics
- Prevents false success claims

### FIX #4: Prevent DA006 Race Condition ✅ DONE

**Commit:** b83a161
- Append blank row first to lock position in queue
- Calculate ID AFTER append based on rows that came before
- Prevents concurrent requests from calculating same ID
- Fixes financial record integrity issue

```typescript
// Fixed approach:
const myRow = await sheetsService.appendRow(sheetName, blankRow); // Lock position
const highest = earlier.reduce(...); // Count existing DA### IDs
const finalId = "DA" + String(highest + 1).padStart(3, "0"); // Safe calculation
```

### FIX #5: Enable Email Fallback in Donor Matching ✅ DONE

**Commit:** 1e7ae35
- Allow donations to match donors by email even when donorId present
- Handles cases where donor has multiple IDs in system
- Fixes donations hidden from donor CRM when IDs diverged

```typescript
// Fixed logic:
export function belongsToDonor(d: DonationLike, donor: DonorIdentity): boolean {
  if (d.donorId && d.donorId === donor.id) return true;
  const email = norm(donor.email);
  return !!email && norm(d.donorEmail) === email; // Email fallback always tried
}
```

---

## TEST PLAN

### Test 1: Email Delivery With Verification (Critical)

**Procedure:**
1. Submit test donation via /api/donate with test email
2. Check /api/admin/donations to see if email status is recorded
3. Verify error details are available if email failed
4. Check Google Sheets for donation record
5. Check Gmail for actual email in test inbox

**Success Criteria:**
- Donation persists ✅
- Email status recorded (success or failure) ✅
- Admin can see email status ✅
- Actual inbox delivery confirmed ✅

### Test 2: Admin Broadcast Failure Handling

**Procedure:**
1. Send broadcast to test inboxes
2. Intentionally trigger failure (bad email, network issue, etc.)
3. Verify failure is recorded with reason
4. Check broadcast history shows actual outcome

### Test 3: DA006 Duplicate Investigation

**Procedure:**
1. Query Google Sheets for DA006 entries
2. Compare row numbers and data
3. Verify ID generation doesn't produce duplicates
4. Attempt duplicate submission with idempotency key

### Test 4: Donor Profile with Donations

**Procedure:**
1. Submit donation as new donor
2. Navigate to donor profile
3. Verify donation history shows
4. Check pending vs verified visibility

---

## NEXT ACTIONS

**COMPLETED:**
1. ✅ FIX #1: Error handling in DonationService (c10be4e3, 8f1b212)
2. ✅ FIX #2: Email status fields (c10be4e3, 8f1b212)
3. ✅ FIX #3: Broadcast semantics (c8a77a35)
4. ✅ FIX #4: DA006 race condition (cb83a161)
5. ✅ FIX #5: Email fallback in matching (c1e7ae35)

**PENDING:**
1. Priority 3: Test email delivery end-to-end with approved inboxes
2. Priority 4: Regression testing (TypeScript, lint, build, integration tests)
3. Documentation of DA006 existing records and safe correction plan

**NO DEPLOYMENT** until all fixes tested and verified.

---

## STATUS TRACKING

| Issue | Root Cause | Fix Status | Test Status | Deployment |
|-------|-----------|-----------|-------------|------------|
| Email failures silent | Exception swallowed | ✅ FIXED (c10be4e3, 8f1b212) | ⏳ PENDING | ⏳ BLOCKED |
| No email status tracking | Schema missing fields | ✅ FIXED (c10be4e3, 8f1b212) | ⏳ PENDING | ⏳ BLOCKED |
| Broadcast semantics unclear | SMTP != delivery | ✅ FIXED (c8a77a35) | ⏳ PENDING | ⏳ BLOCKED |
| DA006 duplicate | Race condition pre-append | ✅ FIXED (cb83a161) | ⏳ PENDING | ⏳ BLOCKED |
| Donor CRM missing info | Email fallback missing | ✅ FIXED (c1e7ae35) | ⏳ PENDING | ⏳ BLOCKED |

---

**Investigation Phase Complete**  
**Ready to implement fixes**
