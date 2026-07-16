import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We use ts-node/tsx to run this so we can import the TS file directly.
import { sendAllocationEmail } from './lib/email/resend';

async function sendTest() {
  const targetEmail = "ahmedkhananas57@gmail.com";
  
  console.log("Sending beautiful Allocation Email to:", targetEmail);
  
  try {
    const result = await sendAllocationEmail(
      targetEmail,
      "Ahmed Khan",
      "Family Relief Bundle (Case DA001)",
      15000,
      "INR"
    );
    
    if (result.success) {
      console.log("✅ Email sent successfully! Message ID:", result.providerMessageId);
    } else {
      console.error("❌ Failed to send email:", result.error);
    }
  } catch (err) {
    console.error("Crash during send:", err);
  }
  
  process.exit(0);
}

sendTest();
