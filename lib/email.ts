export interface DonationEmailParams {
  trackingId: string;
  donorName: string;
  donorEmail: string;
  amount: number;
  causes: { causeName: string; allocatedAmount: number }[];
  date: string;
}

export async function sendDonationEmail(params: DonationEmailParams) {
  const { trackingId, donorName, donorEmail, amount, causes, date } = params;

  const causesListHtml = causes.map(c => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #a0aec0;">${c.causeName}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #fdfbf7; font-weight: 500; text-align: right;">₹${c.allocatedAmount.toLocaleString()}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Contribution Recorded - Daarayn Foundation</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #050810; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      
      <div style="max-width: 600px; margin: 0 auto; background-color: #0a0f1a; border: 1px solid #1a2235; border-radius: 16px; overflow: hidden; margin-top: 40px; margin-bottom: 40px;">
        
        <!-- Header -->
        <div style="background-color: #050810; padding: 40px 30px; text-align: center; border-bottom: 1px solid #1a2235;">
          <h1 style="color: #fdfbf7; font-size: 28px; font-weight: 400; margin: 0 0 10px 0; font-family: Georgia, serif;" dir="rtl">
            جزاك الله خيرًا
          </h1>
          <p style="color: #a0aec0; margin: 0; font-size: 14px; letter-spacing: 1px;">JAZĀK ALLĀHU KHAYRAN</p>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-top: 0;">
            Dear ${donorName || 'Generous Donor'},
          </p>
          <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">
            May Allah reward you with abundant goodness. Your contribution of <strong>₹${amount.toLocaleString()}</strong> has been securely received by Daarayn Foundation and is currently pending verification.
          </p>

          <!-- Dua Box -->
          <div style="background-color: #111827; border-left: 4px solid #d4af37; padding: 20px; border-radius: 0 8px 8px 0; margin: 30px 0;">
            <p style="margin: 0; font-size: 15px; line-height: 1.6; font-style: italic; color: #e2e8f0;">
              "O Allah, accept this charity, place barakah in their wealth, forgive their shortcomings, ease their affairs, and make this contribution a source of continuous reward. Āmīn."
            </p>
          </div>

          <!-- Summary -->
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #718096; border-bottom: 1px solid #1a2235; padding-bottom: 10px; margin-top: 40px;">
            Contribution Summary
          </h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 15px;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #a0aec0;">Tracking ID</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #d4af37; font-family: monospace; font-size: 16px; text-align: right;">${trackingId}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #a0aec0;">Date</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #fdfbf7; text-align: right;">${date}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #a0aec0;">Status</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #1a2235; color: #fbbf24; text-align: right;">Pending Verification</td>
            </tr>
            ${causesListHtml}
          </table>

          <!-- Verse -->
          <div style="margin-top: 40px; text-align: center; padding: 30px 20px; background-color: rgba(212, 175, 55, 0.05); border-radius: 12px;">
            <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1; font-style: italic; margin-top: 0;">
              "The example of those who spend their wealth in the way of Allah is like a seed that grows seven ears; in every ear are one hundred grains. And Allah multiplies for whom He wills."
            </p>
            <p style="font-size: 12px; color: #d4af37; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0;">
              — Surah Al-Baqarah (2:261)
            </p>
          </div>

          <div style="text-align: center; margin-top: 40px;">
            <a href="https://daaraynaid.org/#ledger" style="display: inline-block; background-color: #fdfbf7; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Track in Public Ledger
            </a>
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #050810; padding: 30px; text-align: center; border-top: 1px solid #1a2235;">
          <p style="margin: 0; color: #718096; font-size: 13px;">
            Daarayn Foundation<br>
            Amanah. Transparency. Trust.
          </p>
        </div>

      </div>
      
    </body>
    </html>
  `;

  // TODO: Integrate actual email provider (e.g. Resend, SendGrid, Nodemailer)
  // For now, we mock the email sending to ensure the flow is robust.
  console.log("========== MOCK EMAIL DISPATCH ==========");
  console.log(`To: ${donorEmail}`);
  console.log(`Subject: Jazakallah Khair - Contribution Recorded [${trackingId}]`);
  console.log("HTML Template Generated Successfully.");
  console.log("=========================================");

  return { success: true };
}
