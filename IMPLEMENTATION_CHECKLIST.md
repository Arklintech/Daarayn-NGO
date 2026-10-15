# DAARAYN Implementation Checklist

**Branch:** `fix/realtime-donations-khizr-removal`  
**Commit:** `c8a3f9d`  
**Build Status:** ✅ PASSING (local build succeeds)  
**TypeScript:** ✅ NO ERRORS  

---

## Phase 1: Verify External Services (Required Before Testing)

### Firebase Authentication Setup

**Action Required:** Go to Firebase Console and verify Email/Password sign-in is enabled

```
[ ] Open https://console.firebase.google.com
[ ] Select project: "daaraynorg-9165c"
[ ] Navigate to: Authentication > Sign-in method
[ ] Verify "Email/Password" is ENABLED (toggle is on)
    ↓ If disabled: Click "Email/Password", toggle ON, click Save
[ ] Check "Users" tab
    [ ] Admin user account exists (email: ?)
        ↓ If not: Click "Add user", enter email + password, click Create
    [ ] Field agent accounts exist (email(s): ?)
        ↓ If not: Create them now
[ ] Verify all users have status "Enabled" (not disabled)
```

**Verification Test:**
```bash
npm run dev
# Open: http://localhost:3000/admin/login
# Try to sign in with admin account
# Expected: Redirect to /admin/dashboard
```

---

### Gmail SMTP Setup

**Action Required:** Verify Gmail 2FA and app password are configured

```
[ ] Open https://myaccount.google.com/security
[ ] Sign in with: daaraynorg@gmail.com
[ ] Verify "2-Step Verification" is ENABLED
    ↓ If disabled: Click "2-Step Verification", follow setup steps
[ ] Find "App passwords" (only visible if 2FA is enabled)
    ↓ If not found: Make sure 2FA is fully set up
[ ] App password for "Mail" and "Windows Computer" exists
    ↓ If not: Click "Select app" → Mail, "Select device" → Windows Computer, Generate
[ ] Compare password to SMTP_PASS in .env.local
    ↓ Should be 16 characters, no spaces
    ↓ If different: Update .env.local with the new one
```

**Verification Test:**
```bash
# Edit test-smtp.js: Change TEST_EMAIL_TO to your actual test email
TEST_EMAIL_TO = 'your-real-test-email@example.com'

# Run:
node test-smtp.js

# Expected output:
# ✅ SMTP connection verified
# ✅ Email sent successfully
#
# Check your test email inbox for the test message (arrives in 30s)
```

---

### Vercel Environment Variables (Production)

**Action Required:** Ensure Vercel has all Firebase and SMTP env vars set

```bash
# Check which env vars are set in Vercel:
vercel env ls

# Should include:
[ ] NEXT_PUBLIC_FIREBASE_API_KEY
[ ] NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
[ ] NEXT_PUBLIC_FIREBASE_PROJECT_ID
[ ] EMAIL_PROVIDER = "gmail"
[ ] SMTP_HOST = "smtp.gmail.com"
[ ] SMTP_PORT = "587"
[ ] SMTP_USER = "daaraynorg@gmail.com"
[ ] SMTP_PASS = [app password]

# If any are missing, add them:
vercel env add VARIABLE_NAME
# Then paste the value at the prompt
```

---

## Phase 2: Test Local Development

### Start Development Server

```bash
npm run dev

# Expected output:
# ▲ Next.js 16.x.x
# - Local:        http://localhost:3000
# - Environments: .env.local
```

### Test Public Website

```
[ ] Open http://localhost:3000
    [ ] Page loads without errors
    [ ] Donation form is visible
    [ ] Cause selector shows causes
    [ ] Upload payment screenshot works
[ ] Submit a test donation
    [ ] Form accepts submission
    [ ] Redirects to success page
    [ ] Shows tracking ID
[ ] Check admin inbox
    [ ] Donation confirmation email received (within 60s)
```

### Test Admin Login

```
[ ] Open http://localhost:3000/admin/login
    [ ] Login form is visible
    [ ] Username/password inputs work
[ ] Sign in with test admin account
    [ ] Email: [test admin email from Firebase]
    [ ] Password: [test password]
    [ ] Expected: Redirects to /admin/dashboard
[ ] Verify admin is logged in
    [ ] Dashboard loads
    [ ] Navigation sidebar shows
    [ ] Can navigate to admin pages
```

### Test Field Agent Login

```
[ ] Open http://localhost:3000/field/login
    [ ] Login form is visible
[ ] Sign in with test field agent account
    [ ] Email: [test agent email from Firebase]
    [ ] Password: [test password]
    [ ] Expected: Redirects to /field/dashboard
[ ] Verify agent is logged in
    [ ] Field dashboard loads
    [ ] Can access field operations
```

---

## Phase 3: Test Real-Time Infrastructure

### Two-Device/Window Test

**Prerequisite:** Firebase Auth and SMTP must be working

```
[ ] Open TWO browser windows/tabs:
    Window A: http://localhost:3000/admin/dashboard
    Window B: http://localhost:3000/admin/dashboard
    Both logged in as same admin user
    
[ ] In Window A: Open DevTools > Network > Filter "stream"
    [ ] Should see SSE connection to /api/realtime/stream
    [ ] Connection status: "established" (green)
    
[ ] Submit test donation via public form (third tab/window)
    [ ] Fill donation form
    [ ] Upload payment screenshot
    [ ] Click Submit
    [ ] Get tracking ID (e.g., DA001)
    
[ ] Check Window A: Donations page should update automatically
    [ ] New donation appears in list
    [ ] No manual refresh needed
    [ ] Shows correct donor, amount, status
    
[ ] Check Window B: Should also see new donation
    [ ] Both windows show same data
    [ ] No refresh needed
    
[ ] In Window A: Change donation status from "pending" to "completed"
    [ ] Click donation row
    [ ] Click "Verify" button
    [ ] Status updates
    
[ ] Check Window B: Status should update automatically
    [ ] Both windows now show "completed"
    [ ] No refresh needed
    
[ ] In Window A: Check dashboard totals
    [ ] "Total Donations" increased
    [ ] "Verified Contributions" increased
    [ ] "Awaiting Verification" decreased
    
[ ] Check Window B: Dashboard totals should match
    [ ] Both windows show same values
```

### Realtime Event Verification

```
[ ] In DevTools console (after SSE connection is open):

fetch('/api/realtime/stream')
  .then(res => res.json())
  .catch(err => console.error('SSE error:', err))

# Should see in Network tab:
# - URL: /api/realtime/stream
# - Status: 200 (connected)
# - Type: text/event-stream
# - Messages flowing in real-time
```

---

## Phase 4: Test Donation End-to-End Flow

### Donation Submission → Admin Visibility → Verification

```
[ ] 1. Submit donation via public form
    [ ] All fields filled correctly
    [ ] Payment screenshot uploaded
    [ ] Submit succeeds
    [ ] Tracking ID returned (e.g., DA002)
    
[ ] 2. Check admin inbox
    [ ] Donation confirmation email received
    [ ] Email shows:
        - Tracking ID
        - Donor name
        - Amount
        - Cause(s)
        - Date
    
[ ] 3. Check Admin Donations page
    [ ] Donation appears in list (no refresh needed if SSE works)
    [ ] Shows correct:
        - Tracking ID
        - Donor name
        - Donor email
        - Amount
        - Cause
        - Status: "pending"
        - Payment proof (screenshot)
        
[ ] 4. Check Admin Donors page
    [ ] Donor appears in CRM
    [ ] Shows:
        - Name
        - Email
        - Total donations count (incremented)
        - Total amount donated (incremented)
        
[ ] 5. Check Donor Profile
    [ ] Click on donor in CRM
    [ ] Verify donation appears in "Donations" tab
    [ ] Shows correct amount and status
    [ ] "Lifetime Giving" updated
    
[ ] 6. Verify donation
    [ ] In Admin Donations: Click on donation
    [ ] Click "Verify" button
    [ ] Status changes to "completed"
    
[ ] 7. Check metrics updated
    [ ] Dashboard "Total Donations" increased
    [ ] Dashboard "Verified Contributions" count increased
    [ ] Donor profile "Lifetime Giving" updated
    [ ] All updated without manual refresh
```

---

## Phase 5: Test Cause Management

### Cause Listing

```
[ ] Check Admin Causes page loads
    [ ] All causes display with:
        - Name
        - Description
        - Raised amount
        - Contributor count
        - Status
[ ] Each cause shows funding total from verified donations only
    [ ] Not from pending donations
    [ ] Not from hardcoded values
    
[ ] Check public website cause display
    [ ] All published causes show on /
    [ ] Each cause card shows current raised amount
    [ ] Matches admin amount
```

### Donation Attribution

```
[ ] Submit donations to 2 different causes
    Donation 1: Cause A, ₹1000
    Donation 2: Cause B, ₹2000
    
[ ] Verify in Admin Causes:
    Cause A: ₹1000 (1 donor)
    Cause B: ₹2000 (1 donor)
    
[ ] Verify in Cause Detail pages:
    Cause A page: Shows ₹1000 raised, 1 supporter
    Cause B page: Shows ₹2000 raised, 1 supporter
```

---

## Phase 6: Test Communications (Cause-Based)

**Prerequisite:** Firebase Auth and SMTP must be working

```
[ ] Open Admin Communications page
    [ ] Login successful
    [ ] Page loads
    
[ ] Create test communication:
    [ ] Select Purpose: "General Communication"
    [ ] Select Audience: [Specific Cause A]
    [ ] Expected: Shows donors who donated to Cause A
    [ ] Display their email addresses
    
[ ] Preview before sending:
    [ ] Shows exact recipients
    [ ] Shows email addresses
    [ ] Shows how many will receive
    
[ ] Send communication:
    [ ] Click "Send"
    [ ] Email sent to all displayed recipients only
    [ ] Check inbox: Emails received
    [ ] Subject and body are correct
    
[ ] Test "All Donors" audience:
    [ ] Select Audience: "All Donors (Universal)"
    [ ] Expected: Shows all registered donors
    [ ] Should be larger count than single cause
```

---

## Phase 7: Verify Completeness

### Code Quality

```bash
[ ] npx tsc --noEmit
    Expected: No TypeScript errors
    
[ ] npm run lint
    Expected: No linting errors
    
[ ] npm run build
    Expected: Production build succeeds
    Exit code: 0
```

### KHIZR Removal Verification

```bash
[ ] grep -r "khizr\|KHIZR\|grok\|Grok" app lib --exclude-dir=node_modules
    Expected: No matches (or only false positives in comments)
    
[ ] Check deleted files:
    [ ] app/admin/ai/ deleted
    [ ] app/api/admin/ai/ deleted
    [ ] lib/ai/ deleted
    [ ] docs/MEIS/ deleted
    [ ] No orphaned AI imports
```

### Real-Time Infrastructure Verification

```bash
[ ] Check all realtime files exist:
    [ ] lib/realtime/events.ts
    [ ] lib/realtime/eventLog.ts
    [ ] lib/realtime/broadcaster.ts
    [ ] lib/realtime/client.ts
    [ ] lib/realtime/useRealtime.ts
    [ ] app/api/realtime/stream/route.ts
    [ ] lib/donations/metrics.ts
    [ ] lib/donations/snapshot.ts
    
[ ] Check metrics are used everywhere:
    [ ] grep -r "donationState" app lib
    [ ] grep -r "fundingByCause" app lib
    [ ] grep -r "givingByDonor" app lib
    Expected: Multiple matches, showing shared usage
```

---

## Phase 8: Production Deployment

### Pre-Deployment Checklist

```
[ ] All Phase 1-7 items completed ✅
[ ] Build passes: npm run build ✅
[ ] TypeScript passes: npx tsc --noEmit ✅
[ ] All tests pass (if any exist) ✅
[ ] Firebase accounts created and tested ✅
[ ] SMTP verified working ✅
[ ] Vercel env vars set ✅
```

### Deployment

```bash
[ ] Push to main:
    git push origin fix/realtime-donations-khizr-removal:main
    
[ ] Vercel auto-deploys (or manual deploy via console)
    Expected: Build succeeds on Vercel
    
[ ] Verify production URLs work:
    [ ] https://daarayn.vercel.app (or your production domain)
    [ ] https://daarayn.vercel.app/admin/login
    [ ] https://daarayn.vercel.app/field/login
    
[ ] Production smoke test:
    [ ] Submit test donation
    [ ] Check admin inbox for email
    [ ] Log in to admin
    [ ] See donation in Donations page
    [ ] Verify status change works
```

---

## Summary

| Phase | Status | Estimated Time |
|---|---|---|
| 1. Verify External Services | ⏳ REQUIRED | 15 min |
| 2. Test Local Development | ⏳ REQUIRED | 20 min |
| 3. Test Real-Time Infrastructure | ⏳ REQUIRED | 15 min |
| 4. Test Donation Flow | ⏳ REQUIRED | 20 min |
| 5. Test Cause Management | ⏳ REQUIRED | 15 min |
| 6. Test Communications | ⏳ REQUIRED | 15 min |
| 7. Verify Completeness | ⏳ REQUIRED | 10 min |
| 8. Production Deployment | ⏳ REQUIRED | 10 min |
| **Total** | | **~2 hours** |

---

## Quick Start Commands

```bash
# Run diagnostic test
node test-diagnostics.js

# Test SMTP (after setting TEST_EMAIL_TO)
node test-smtp.js

# Start dev server
npm run dev

# Build for production
npm run build

# TypeScript check
npx tsc --noEmit

# Push to main
git push origin fix/realtime-donations-khizr-removal:main
```

---

**Next Step:** Complete Phase 1 (Firebase + SMTP verification), then report back to proceed with Phase 2+
