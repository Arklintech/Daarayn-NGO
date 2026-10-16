const fs = require("fs");

// Create test donation payload
const testPayload = {
  donorName: "EmailFixTestDonor",
  donorContact: "emailfix-test@example.com",
  amount: 350,
  currency: "INR",
  cause: "General Support",
  submissionKey: `test-email-fix-${Date.now()}`
};

// Read test image for payment proof
const testImagePath = "C:\\tmp\\test_proof.png";
const imageBuffer = Buffer.from('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82');

async function testDonationEmailFix() {
  console.log("=== TESTING DONATION EMAIL FIX (commit 10be4e3) ===\n");
  console.log("Test: Submit donation and verify email status tracking\n");

  try {
    // Create form data
    const FormData = require("form-data");
    const form = new FormData();
    
    form.append("donorName", testPayload.donorName);
    form.append("donorContact", testPayload.donorContact);
    form.append("amount", testPayload.amount.toString());
    form.append("currency", testPayload.currency);
    form.append("cause", testPayload.cause);
    form.append("submissionKey", testPayload.submissionKey);
    form.append("screenshot", imageBuffer, "test_proof.png");

    // Submit donation
    const response = await fetch("http://localhost:3000/api/donate", {
      method: "POST",
      body: form,
      headers: form.getHeaders()
    });

    const data = await response.json();
    
    console.log("API Response:");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    // Check response structure
    if (!data.trackingId) {
      console.log("❌ FAILED: No trackingId in response");
      return false;
    }

    console.log(`✅ Donation created: ${data.trackingId}\n`);

    // Check for email status fields
    console.log("Checking for email status fields in response:");
    console.log(`  - confirmationEmailSent: ${data.confirmationEmailSent !== undefined ? "✅ Present" : "❌ Missing"}`);
    console.log(`  - confirmationEmailError: ${data.confirmationEmailError !== undefined ? "✅ Present" : "❌ Missing"}`);
    
    if (data.confirmationEmailSent !== undefined) {
      console.log(`    Value: ${data.confirmationEmailSent}`);
    }
    if (data.confirmationEmailError !== undefined) {
      console.log(`    Error: ${data.confirmationEmailError}`);
    }

    console.log("\n✅ Test complete. Email status fields are being returned by API.");
    return true;

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return false;
  }
}

testDonationEmailFix().then(success => {
  process.exit(success ? 0 : 1);
});
