# Daarayn Platform — Secrets Rotation Policy

**Status:** Active  
**Owner:** Platform Administrator  
**Review Cadence:** Quarterly

---

## Policy

All credentials and API keys used by the Daarayn platform MUST be rotated on a defined schedule.
No credential should remain in use for more than 90 days without a documented rotation.

---

## Active Credentials Inventory

| Credential | Where Stored | Last Rotated | Next Due | Owner |
|---|---|---|---|---|
| Firebase Service Account Key | `.env.local` → `GOOGLE_APPLICATION_CREDENTIALS` | _(document on first rotation)_ | 90 days from first use | Admin |
| Groq API Key (`GROQ_API_KEY`) | `.env.local` | _(document on first rotation)_ | 90 days from first use | Admin |
| SMTP Credentials (`SMTP_USER`, `SMTP_PASSWORD`) | `.env.local` | _(document on first rotation)_ | 90 days from first use | Admin |
| Resend API Key (`RESEND_API_KEY`) | `.env.local` | _(document on first rotation)_ | 90 days from first use | Admin |
| Firebase Web API Key (`NEXT_PUBLIC_FIREBASE_API_KEY`) | `.env.local` (client-visible) | _(document on first rotation)_ | 180 days | Admin |

---

## Rotation Procedure

### For Groq API Key
1. Log in to console.groq.com → API Keys → Create new key
2. Update `GROQ_API_KEY` in `.env.local` and in your deployment environment (Vercel / Railway)
3. Redeploy the application
4. Verify KHIZR AI responds correctly with a test prompt
5. Revoke the old key from console.groq.com
6. Update the "Last Rotated" date in this table above

### For SMTP (Gmail App Password)
1. Visit Google Account → Security → App Passwords
2. Create a new App Password for "Mail / Other"
3. Update `SMTP_PASSWORD` in `.env.local` and deployment env
4. Send a test email via `/api/test-email` and confirm delivery
5. Delete the old App Password from Google
6. Update this table

### For Firebase Service Account
1. Firebase Console → Project Settings → Service Accounts → Generate new private key
2. Replace the key file / environment variable
3. Verify Firebase reads/writes work correctly
4. Revoke the old key from Firebase Console
5. Update this table

### For Firebase Web Config
The Web API Key is domain-restricted via Firebase Console. Rotation requires:
1. Firebase Console → Project Settings → General → Web API Key → Regenerate
2. Update all `NEXT_PUBLIC_FIREBASE_*` values in `.env.local` and deployment env
3. Redeploy and verify Firebase Auth works

---

## Pre-Rotation Audit

Before rotating any credential, run the targeted audit per Section A.1 of `PRODUCTION_AUDIT_SOP.md`.

---

## Emergency Rotation

If a credential is suspected compromised:
1. **Immediately** revoke/disable the credential at the provider (do not wait)
2. Generate a replacement
3. Deploy with the new credential as an emergency hotfix
4. File an incident report documenting what was compromised, when it was detected, and the remediation taken

---

*Last reviewed: 2026-07-17*
