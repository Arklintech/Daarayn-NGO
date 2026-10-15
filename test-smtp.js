#!/usr/bin/env node
/**
 * test-smtp.js
 *
 * Test Gmail SMTP configuration locally.
 * This verifies that emails can actually be sent.
 *
 * Run: node test-smtp.js
 *
 * IMPORTANT: Change TEST_EMAIL_TO before running!
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║       SMTP Configuration Test                          ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Configuration from environment
const smtpConfig = {
  host: (process.env.SMTP_HOST || '').trim().replace(/^["']|["']$/g, ''),
  port: parseInt((process.env.SMTP_PORT || '587').trim().replace(/^["']|["']$/g, ''), 10),
  secure: (process.env.SMTP_SECURE || 'false').trim().replace(/^["']|["']$/g, '') === 'true',
  user: (process.env.SMTP_USER || '').trim().replace(/^["']|["']$/g, ''),
  pass: (process.env.SMTP_PASS || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ''),
  from: (process.env.FROM_EMAIL || '').trim().replace(/^["']|["']$/g, ''),
};

// ⚠️  CHANGE THIS TO YOUR TEST EMAIL ADDRESS
const TEST_EMAIL_TO = 'your-test-email@example.com';

console.log('Configuration:');
console.log(`  Host: ${smtpConfig.host}`);
console.log(`  Port: ${smtpConfig.port}`);
console.log(`  Secure (TLS): ${smtpConfig.secure}`);
console.log(`  User: ${smtpConfig.user}`);
console.log(`  Password: ${smtpConfig.pass ? smtpConfig.pass.slice(0, 3) + '***' : '(empty)'}`);
console.log(`  From: ${smtpConfig.from}`);
console.log(`\n  Test Email To: ${TEST_EMAIL_TO}\n`);

// Validate
if (!smtpConfig.host) {
  console.error('❌ SMTP_HOST not set in .env.local\n');
  process.exit(1);
}
if (!smtpConfig.user) {
  console.error('❌ SMTP_USER not set in .env.local\n');
  process.exit(1);
}
if (!smtpConfig.pass) {
  console.error('❌ SMTP_PASS not set in .env.local\n');
  process.exit(1);
}
if (TEST_EMAIL_TO === 'your-test-email@example.com') {
  console.error(
    '❌ Please change TEST_EMAIL_TO in this script to your actual test email address.\n'
  );
  process.exit(1);
}

// Create transporter
const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.secure,
  requireTLS: !smtpConfig.secure,
  pool: true,
  maxConnections: 3,
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

// Test steps
(async () => {
  try {
    console.log('Testing SMTP connection...\n');

    // Step 1: Verify connection
    console.log('  Step 1: Verifying SMTP connection');
    await transporter.verify();
    console.log('    ✅ SMTP connection verified\n');

    // Step 2: Send test email
    console.log('  Step 2: Sending test email');
    const info = await transporter.sendMail({
      from: smtpConfig.from || smtpConfig.user,
      to: TEST_EMAIL_TO,
      subject: '✅ DAARAYN SMTP Test — Email System Working',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h1 style="color: #2c3e50; text-align: center;">✅ SMTP Test Successful</h1>

              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                If you received this email, the Daarayn Foundation's email system is working correctly.
              </p>

              <div style="background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="color: #555; margin: 0; font-family: monospace; font-size: 12px;">
                  <strong>Test Details:</strong><br/>
                  Provider: Gmail SMTP<br/>
                  Host: ${smtpConfig.host}<br/>
                  Port: ${smtpConfig.port}<br/>
                  Time: ${new Date().toISOString()}
                </p>
              </div>

              <p style="color: #7f8c8d; font-size: 12px; text-align: center;">
                This is an automated test message. No action needed.
              </p>
            </div>
          </body>
        </html>
      `,
      text: 'DAARAYN SMTP test successful. If you received this, the email system is working.',
    });

    console.log(`    ✅ Email sent successfully\n`);
    console.log(`  Step 3: Confirmation`);
    console.log(`    Message ID: ${info.messageId}`);
    console.log(`    Response: ${info.response}\n`);

    console.log('────────────────────────────────────────────────────────\n');
    console.log('✅ SMTP TEST PASSED\n');
    console.log('Check your inbox at:');
    console.log(`  ${TEST_EMAIL_TO}\n`);
    console.log('The test email should arrive within 30 seconds.\n');
    console.log('If the email does not arrive:\n');
    console.log('  1. Check spam/junk folder');
    console.log('  2. Verify Gmail 2FA is enabled');
    console.log('  3. Verify app password is set correctly');
    console.log('  4. Check Gmail account security settings\n');

    transporter.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ SMTP TEST FAILED\n');
    console.error(`Error: ${error.message}\n`);

    if (error.code === 'EAUTH') {
      console.error('Authentication failed. Check:');
      console.error('  • Gmail account credentials');
      console.error('  • 2FA is enabled');
      console.error('  • App password is generated');
      console.error('  • App password is entered without spaces\n');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Connection refused. Check:');
      console.error('  • SMTP_HOST is correct');
      console.error('  • SMTP_PORT is correct');
      console.error('  • Firewall/network allows SMTP\n');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('Connection timed out. Check:');
      console.error('  • Network connectivity');
      console.error('  • Firewall is not blocking SMTP\n');
    }

    console.error('Full error:');
    console.error(error);
    console.error('');

    transporter.close();
    process.exit(1);
  }
})();
