# Gmail SMTP Configuration Diagnosis

## Issue
Emails are not being sent via the Admin Communications panel. No error messages are visible.

## Current Configuration ✅

**Provider:** Gmail SMTP (Nodemailer)  
**Host:** `smtp.gmail.com`  
**Port:** `587` (TLS)  
**User:** `daaraynorg@gmail.com`  
**Password:** `<redacted>` (appears to be a Gmail App Password)  

**Implementation:**
- `lib/email/providerManager.ts` — Routes email to Gmail or Resend
- `lib/email/providers/gmail.ts` — Nodemailer SMTP implementation with connection pooling
- `lib/email.ts` — HTML email templates for donation confirmations
- Verification function: `verifyEmailProvider()` to test SMTP before broadcasting

## Diagnosis Checklist

### Step 1: Verify Gmail is Configured
```bash
# Check environment variables are set
echo "SMTP_USER: ${SMTP_USER}"
echo "SMTP_PASS: ${SMTP_PASS}"
echo "SMTP_HOST: ${SMTP_HOST}"
echo "SMTP_PORT: ${SMTP_PORT}"
echo "EMAIL_PROVIDER: ${EMAIL_PROVIDER}"
```

Expected output:
```
SMTP_USER: daaraynorg@gmail.com
SMTP_PASS: <redacted>
SMTP_HOST: smtp.gmail.com
SMTP_PORT: 587
EMAIL_PROVIDER: gmail
```

### Step 2: Verify Gmail Credentials

[ ] Gmail account: `daaraynorg@gmail.com`
[ ] Password: Check the actual Gmail account (not the app password above)
[ ] 2-Factor Authentication: **ENABLED** (required for app passwords)
[ ] Less Secure Apps: **DISABLED** (use app passwords instead)

To create a Gmail App Password:
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification if not already enabled
3. Go to App Passwords
4. Select "Mail" and "Windows Computer"
5. Generate a new app password
6. Copy the 16-character password (without spaces)
7. Update `SMTP_PASS` with this password

### Step 3: Test SMTP Locally

Create `test-smtp.js` in the repo root:
```javascript
const nodemailer = require("nodemailer");

async function testSmtp() {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: "daaraynorg@gmail.com",
      pass: "<redacted>", // Replace with actual app password
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  try {
    const info = await transporter.sendMail({
      from: "Daarayn Foundation <daaraynorg@gmail.com>",
      to: "test@example.com", // Use a test email you own
      subject: "SMTP Test from Node.js",
      html: "<p>If you see this, SMTP is working!</p>",
    });
    console.log("✅ Email sent successfully!");
    console.log("Message ID:", info.messageId);
    transporter.close();
  } catch (error) {
    console.error("❌ SMTP Error:", error);
    transporter.close();
  }
}

testSmtp();
```

Run:
```bash
node test-smtp.js
```

### Step 4: Verify Provider in Vercel

Check environment variables are set in Vercel Production:
```bash
vercel env ls
# Should show:
# EMAIL_PROVIDER
# SMTP_HOST
# SMTP_USER
# SMTP_PASS
# SMTP_PORT
# SMTP_SECURE
# FROM_EMAIL
```

If missing, add them:
```bash
vercel env add EMAIL_PROVIDER
# Prompts for value: gmail

vercel env add SMTP_USER
# Prompts for value: daaraynorg@gmail.com

vercel env add SMTP_PASS
# Prompts for value: <redacted> (the app password)

# etc.
```

### Step 5: Test Communications in Admin

1. Log in to `/admin/communications` (requires Firebase auth)
2. Fill out a test communication:
   - **Purpose:** General Communication
   - **Audience:** All Donors (Universal)
   - **Message:** "Test email from Daarayn"
3. Click "Send"
4. Check:
   - [ ] No error message appears
   - [ ] Progress indicator shows send completing
   - [ ] Communications history record is created (even if send failed)
   - [ ] Test inbox receives email within 60 seconds

### Step 6: Check Function Logs in Vercel

If emails still don't arrive:
```bash
vercel logs --follow
# or in Vercel Console > Settings > Function Logs
```

Look for:
```
[Gmail] SMTP Error: ...
[Email] Could not verify SMTP: ...
[Broadcast] Failed to send to [recipient]: ...
```

These logs will show the exact SMTP error code and message.

## Common SMTP Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid credentials` | Wrong username or password | Verify Gmail account and app password |
| `Too many login attempts` | Rate limited by Google | Wait 24 hours, check for suspicious activity in Gmail |
| `SMTP requires TLS` | Secure connection needed | Set `SMTP_SECURE=false` and `requireTLS=true` |
| `Connection timeout` | Network/firewall blocking | Check if port 587 is open to `smtp.gmail.com` |
| `ENOTFOUND smtp.gmail.com` | DNS resolution failed | Check network connectivity |
| `Application-specific password required` | 2FA enabled, app password not used | Generate app password in Gmail settings |
| `Less Secure Apps turned off` | Outdated authentication method | Enable 2FA and use app passwords instead |
| `Invalid Encoding` | Email contains invalid characters | Check HTML encoding in email template |

## Testing Script

Create `test-email-provider.ts` in root:
```typescript
import { verifyEmailProvider } from "@/lib/email/providerManager";

async function test() {
  const result = await verifyEmailProvider();
  console.log("Email Provider Status:", result);
  if (result.ok) {
    console.log("✅ Email provider is configured correctly");
  } else {
    console.error("❌ Email provider error:", result.error);
  }
}

test().catch(console.error);
```

Run:
```bash
npx ts-node test-email-provider.ts
```

## Debugging Email Sends

Add logging to `lib/email.ts` temporarily:
```typescript
export async function sendDonationEmail(params: DonationEmailParams): Promise<EmailResult> {
  console.log("[SendDonationEmail] Starting for:", params.donorEmail);
  
  const result = await sendEmail({
    to: params.donorEmail,
    subject: `Contribution Recorded - Reference ${params.trackingId}`,
    html,
  });
  
  console.log("[SendDonationEmail] Result:", result);
  return result;
}
```

Check logs:
```bash
vercel logs --follow --filter "SendDonationEmail"
```

## Provider Switching

If Gmail continues to fail, switch to Resend (alternative):
```bash
# In Vercel Environment Variables:
EMAIL_PROVIDER=resend
RESEND_API_KEY=[your resend api key]
```

Resend (https://resend.com):
- No SMTP setup needed
- Email-only service from Vercel ecosystem
- 100 emails/day free tier
- Better deliverability than Gmail

But if it's a Gmail configuration issue, it's fixable in 5 minutes.

## Recovery Checklist

If emails start failing in production:

- [ ] Check Gmail account hasn't been compromised (check Account Activity)
- [ ] Verify app password hasn't expired (regenerate if unsure)
- [ ] Check Vercel function logs for SMTP errors
- [ ] Test SMTP credentials locally with `test-smtp.js`
- [ ] Check sender domain reputation (Gmail may soft-bounce if it's poor)
- [ ] Verify recipient emails are valid (test with a known-good address first)
- [ ] Check rate limiting: Gmail allows ~100 concurrent SMTP connections

## Environment Variable Template

Add to `.env.local` and Vercel:
```bash
# Email Provider Selection
EMAIL_PROVIDER=gmail

# Gmail SMTP Configuration (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=daaraynorg@gmail.com
SMTP_PASS=<redacted>

# Sender Email
FROM_EMAIL="Daarayn Foundation <daaraynorg@gmail.com>"

# Optional: Reply-to Address (defaults to FROM_EMAIL)
# REPLY_TO_EMAIL=support@daarayn.org
```

---

**Diagnostic Status:** Awaiting SMTP credential verification  
**Priority:** CRITICAL — blocks Communications and donor email confirmations  
**Time to fix:** 10-20 minutes (once credentials are verified)
