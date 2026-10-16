const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: "daaraynorg@gmail.com",
    pass: "***REMOVED-REVOKED-SMTP-PASSWORD***"
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000
});

async function testEmailDelivery() {
  try {
    console.log("Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified\n");

    const testInbox = "anasahmedkhan4535@gmail.com";
    console.log(`Sending test email to: ${testInbox}`);
    
    const info = await transporter.sendMail({
      from: '"Daarayn Foundation" <daaraynorg@gmail.com>',
      to: testInbox,
      subject: "Test Email - Daarayn Communications System",
      html: `<h2>Test Email</h2><p>This is a test email from Daarayn. Time: ${new Date().toISOString()}</p>`
    });

    console.log("✅ Email sent successfully");
    console.log(`   Message ID: ${info.messageId}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Email test failed");
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }
}

testEmailDelivery();
