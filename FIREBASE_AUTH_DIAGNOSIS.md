# Firebase Authentication Diagnosis Guide

## Issue
Both Admin (`/admin/login`) and Field Agents (`/field/login`) are failing with:
```
Firebase: Error (auth/invalid-credential)
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=... 400 (Bad Request)
```

## Root Cause Analysis

### What `auth/invalid-credential` Means
This error occurs when:
1. **User account does NOT exist** in Firebase Auth (most common)
2. Password is wrong
3. User account is disabled
4. Email/Password sign-in method is NOT enabled in Firebase project
5. Invalid API key or domain restriction issues

### Configuration Status ✅
- **Firebase Config:** Correct in `lib/firebase.ts` and `.env.local`
- **Project ID:** `daaraynorg-9165c`
- **Service Account:** Present with correct permissions
- **Sign-in Method:** Using `signInWithEmailAndPassword` correctly

### What Still Needs Verification

## DIAGNOSIS CHECKLIST

### Step 1: Email/Password Sign-in Method
**Location:** Firebase Console → Project: daaraynorg-9165c → Authentication → Sign-in method

```
[ ] Email/Password authentication is ENABLED
    ↓ If disabled:
    [ ] Click "Email/Password"
    [ ] Toggle "Enabled" ON
    [ ] Leave "Email link (passwordless)" OFF
    [ ] Save
```

### Step 2: User Accounts Exist
**Location:** Firebase Console → Authentication → Users

Expected accounts:
```
[ ] Admin user account exists
    Email: ? (Check with project admin)
    Status: Enabled (not disabled)
    Created: ? (should exist, or create new)
    
[ ] Field Agent accounts exist
    Email: ? (Check with project admin)
    Status: Enabled (not disabled)
    Created: ? (should exist, or create new)
```

### Step 3: Create Test User (If None Exist)
**Location:** Firebase Console → Authentication → Users → Add user

```
[ ] Email: test-admin@daarayn.local
[ ] Password: TempPassword123!@# (set temp, force reset on first login)
[ ] Enabled: ✓ Yes
[ ] Create User
```

Test login:
```bash
# In browser console at /admin/login:
# Email: test-admin@daarayn.local
# Password: TempPassword123!@#
```

### Step 4: Verify API Key Restrictions
**Location:** Firebase Console → Project Settings → General → Web API Key

```
[ ] API Key is unrestricted, OR
[ ] API Key restrictions allow:
    - localhost:3000
    - localhost:3001
    - daraayn.vercel.app (production domain)
    - *.vercel.app
```

### Step 5: Verify Domain Restrictions
**Location:** Firebase Console → Project Settings → General

```
[ ] authDomain is correctly set to: daaraynorg-9165c.firebaseapp.com
[ ] storageBucket is correctly set to: daaraynorg-9165c.firebasestorage.app
```

### Step 6: Service Account Permissions
**Location:** Google Cloud Console → IAM & Admin → Service Accounts

Verify `daarayn@daaraynorg-9165c.iam.gserviceaccount.com` has:
```
[ ] Editor role, OR
[ ] Firebase Admin role
[ ] Firebase Authentication Admin role
```

### Step 7: Test Firebase Auth Directly
Run this in the browser console at any page:
```javascript
// lib/firebase.ts exports auth
import { auth } from '/lib/firebase.ts';
import { signInWithEmailAndPassword } from 'firebase/auth';

// Try to sign in with a known user
signInWithEmailAndPassword(auth, 'test@example.com', 'password')
  .then(result => console.log('✅ Auth success:', result.user.email))
  .catch(err => console.error('❌ Auth error:', err.code, err.message));
```

Expected outcomes:
```
✅ Success: "Auth success: test@example.com"
❌ Invalid credential: Check user exists and password is correct
❌ Operation not allowed: Email/Password sign-in not enabled
❌ Too many requests: Rate limited (wait a few minutes)
```

## COMMON ISSUES & FIXES

| Error | Cause | Fix |
|-------|-------|-----|
| `auth/invalid-credential` | User doesn't exist OR password wrong | Create user in Firebase, verify password |
| `auth/user-disabled` | Account manually disabled | Enable in Firebase Console |
| `auth/operation-not-allowed` | Email/Password not enabled | Enable in Firebase Console > Auth > Sign-in method |
| `auth/invalid-email` | Email format invalid | Check email format in form |
| `auth/too-many-requests` | Rate limited | Wait 15 minutes, try again |
| `auth/network-request-failed` | Network blocked | Check firewall, proxy, CORS |

## ENVIRONMENT VARIABLES

Verify these are set in Vercel Production (not just local):
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDf_6iUEtZQ6FRpg42QeDk5eakeHm4XhG8
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=daaraynorg-9165c.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=daaraynorg-9165c
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=daaraynorg-9165c.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=269969400623
NEXT_PUBLIC_FIREBASE_APP_ID=1:269969400623:web:bdb5613251e7524018b7da
```

Check in Vercel:
```bash
vercel env ls
# or in Vercel Console > Settings > Environment Variables
```

## DEBUGGING TOOLS

### 1. Check Firebase Logs
**Location:** Firebase Console → More > All Tools > Cloud Functions

Look for errors in the Authentication logs.

### 2. Enable Debug Mode in Local Dev
Edit `lib/firebase.ts`:
```typescript
if (isFirebaseConfigValid) {
  import('firebase/auth').then(({ initializeAuth, getAuth }) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Firebase] Auth initialized in development mode');
    }
  });
}
```

### 3. Check Browser Network Tab
1. Open DevTools > Network
2. Try to log in
3. Look for POST request to `identitytoolkit.googleapis.com`
4. Check response:
   - Status 400 with `error.code` in response body
   - This tells you the exact error code from Firebase

### 4. Test with cURL
```bash
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyDf_6iUEtZQ6FRpg42QeDk5eakeHm4XhG8" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "returnSecureToken": true
  }'
```

Expected response (success):
```json
{
  "kind": "identitytoolkit#VerifyPasswordResponse",
  "localId": "abc123...",
  "email": "test@example.com",
  "idToken": "eyJhbGc...",
  "registered": true,
  "refreshToken": "xyz789..."
}
```

Expected response (invalid credential):
```json
{
  "error": {
    "code": 400,
    "message": "INVALID_PASSWORD",
    "errors": [{"message": "INVALID_PASSWORD", "domain": "global", "reason": "invalid"}]
  }
}
```

## NEXT STEPS

1. **Check Firebase Console NOW:**
   - Is Email/Password enabled? If no → ENABLE IT
   - Do user accounts exist? If no → CREATE THEM
   - Are they enabled? If disabled → ENABLE THEM

2. **Test sign-in in /admin/login** with a known user

3. **If still failing after step 1-2:**
   - Check API Key restrictions (step 4 above)
   - Verify environment variables in Vercel match local
   - Review Firebase service account permissions

4. **Once auth works:**
   - Create permanent admin and field agent accounts
   - Set up password reset flow
   - Document credentials securely

## CREDENTIALS TEMPLATE

Once accounts are created, document them (privately):
```
Admin Users:
- Email: [admin1@example.com]
  Temp Password: [temp-password]
  Status: [created/tested]
  
Field Agents:
- Email: [agent1@example.com]
  Temp Password: [temp-password]
  Status: [created/tested]
```

Store credentials securely (password manager, not in code).

---

**Diagnostic Status:** Awaiting Firebase Console verification  
**Priority:** CRITICAL — blocks all authenticated functionality  
**Time to fix:** 5-10 minutes (once Firebase Console is checked)
