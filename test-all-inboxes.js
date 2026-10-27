require("dotenv").config({ path: ".env.local" });
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000
});

// Allowlisted test inboxes come from the environment (comma-separated TEST_RECIPIENTS).
const approvedInboxes = (process.env.TEST_RECIPIENTS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (approvedInboxes.length === 0) { console.error("Set TEST_RECIPIENTS to your own test inboxes."); process.exit(1); }

async function testAllInboxes() {
  console.log("Testing Gmail SMTP delivery to approved inboxes\n");
  
  for (const inbox of approvedInboxes) {
    try {
      const info = await transporter.sendMail({
        from: '"Daarayn Test" <daaraynorg@gmail.com>',
        to: inbox,
        subject: `Daarayn Email Test - ${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2,'0')}`,
        html: `<p>Test delivery to ${inbox}</p>`
      });
      console.log(`✅ ${inbox}`);
    } catch (error) {
      console.log(`❌ ${inbox}: ${error.message}`);
    }
  }
  process.exit(0);
}

testAllInboxes();
