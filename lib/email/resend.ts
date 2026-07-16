/**
 * lib/email/resend.ts
 *
 * Public email service for the Daarayn platform.
 * This file is the ONLY entry point for all email operations.
 */

import { sendEmail } from "./providerManager";
import type { EmailResult } from "./providerManager";
import path from "path";

// ─────────────────────────────────────────────
// EMAIL TEMPLATE PROPS
// ─────────────────────────────────────────────
export interface LetterEmailProps {
  title?: string;
  eyebrow?: string;
  headline?: string;
  greeting?: string;
  bodyParagraphs?: string[];
  contributionSummary?: { label: string; value: string }[];
  projectUpdate?: string;
  transparencySummary?: string;
  pullQuote?: string;
  postQuoteParagraph?: string;
  ctaText?: string;
  ctaLink?: string;
  dua?: { arabic: string; english: string };
  signOff?: string;
}

// ─────────────────────────────────────────────
// HTML EMAIL TEMPLATE (LETTER-STYLE)
// ─────────────────────────────────────────────
export function generateLetterEmailTemplate(props: LetterEmailProps): string {
  // Embed logo as base64 data URI — works in all email clients including Gmail
  // (CID attachments are blocked by Gmail web client)
  // Use CID attachment instead of Base64 to prevent Spam flagging by Gmail
  const logoUrl = 'cid:logo@daarayn.org';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${props.title || "Daarayn Foundation"}</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0; padding:0; background-color:#080e1f; font-family:Georgia, 'Times New Roman', serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#080e1f;">
<tr>
<td align="center" style="padding:52px 16px;">

<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px; width:100%; border:1px solid rgba(255, 255, 255, 0.08); border-radius:12px; padding:40px; background-color:rgba(10, 16, 40, 0.5);">

  <!-- HEADER -->
  <tr>
    <td align="center" style="padding:0 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td valign="middle" style="padding-right: 16px;">
            <img src="${logoUrl}" alt="Daarayn Logo" width="80" height="80" style="display:block; width:80px; height:80px; object-fit:contain;" />
          </td>
          <td valign="middle">
            <div style="font-family:'Cinzel', Georgia, serif; font-size:26px; font-weight:600; letter-spacing:4px; color:#ffffff; line-height:1.1; margin:0; padding:0; text-shadow: 0 2px 10px rgba(255,255,255,0.1); text-align: center;">
              DAARAYN
            </div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;">
              <tr>
                <td style="width:30px; border-bottom:1px solid rgba(255,255,255,0.5); vertical-align:middle;">&nbsp;</td>
                <td style="padding:0 8px;">
                  <div style="font-family:'Cinzel', Georgia, serif; font-size:11px; font-weight:300; letter-spacing:3px; color:rgba(255, 249, 221, 0.9); text-transform:uppercase; margin:0;">
                    FOUNDATION
                  </div>
                </td>
                <td style="width:30px; border-bottom:1px solid rgba(255,255,255,0.5); vertical-align:middle;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- EYEBROW (PILL) -->
  ${props.eyebrow ? `
  <tr>
    <td align="center" style="padding:0 0 30px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #D4AF37; border-radius:24px; padding:6px 16px;">
        <tr>
          <td align="center">
            <span style="font-family:Arial, Helvetica, sans-serif; font-size:10px; font-weight:bold; letter-spacing:1.5px; color:#D4AF37; text-transform:uppercase;">${props.eyebrow}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ` : ''}

  <!-- GREETING & INTRO -->
  <tr>
    <td style="padding:0 0 20px;">
      ${props.greeting ? `
      <p style="font-family:Arial, sans-serif; font-size:14px; color:#f3f4f6; line-height:1.6; margin:0; font-weight:bold;">
        ${props.greeting}
      </p>
      ` : ''}
      
      ${props.bodyParagraphs ? props.bodyParagraphs.map(p => `
      <p style="font-family:Arial, sans-serif; font-size:13.5px; color:#f3f4f6; line-height:1.6; margin:20px 0 0;">
        ${p}
      </p>
      `).join('') : ''}
    </td>
  </tr>

  <!-- CONTRIBUTION SUMMARY CARD -->
  ${props.contributionSummary && props.contributionSummary.length > 0 ? `
  <tr>
    <td style="padding:10px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(10, 28, 18, 0.6); border:1px solid rgba(255, 249, 221, 0.1); border-radius:8px; padding:20px;">
        <tr>
          <td colspan="2" style="padding-bottom:16px;">
            <div style="font-family:Georgia, serif; font-weight:bold; font-size:15px; color:#D4AF37;">Contribution Summary</div>
          </td>
        </tr>
        ${props.contributionSummary.map((item, index) => `
        <tr>
          <td style="padding:8px 0; border-bottom:${index === props.contributionSummary!.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)'}; font-family:Arial, sans-serif; font-size:13px; color:#9ca3af;">
            ${item.label}
          </td>
          <td align="right" style="padding:8px 0; border-bottom:${index === props.contributionSummary!.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)'}; font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; font-weight:bold;">
            ${item.value}
          </td>
        </tr>
        `).join('')}
      </table>
    </td>
  </tr>
  ` : ''}

  <!-- PROJECT UPDATE CARD -->
  ${props.projectUpdate ? `
  <tr>
    <td style="padding:10px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(10, 28, 18, 0.6); border:1px solid rgba(255, 249, 221, 0.1); border-radius:8px; padding:20px;">
        <tr>
          <td style="padding-bottom:12px;">
            <div style="font-family:Georgia, serif; font-weight:bold; font-size:15px; color:#D4AF37;">Project Update</div>
          </td>
        </tr>
        <tr>
          <td style="font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; line-height:1.6;">
            ${props.projectUpdate}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ` : ''}

  <!-- TRANSPARENCY CARD -->
  ${props.transparencySummary ? `
  <tr>
    <td style="padding:10px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(10, 28, 18, 0.6); border:1px solid rgba(255, 249, 221, 0.1); border-radius:8px; padding:20px;">
        <tr>
          <td style="padding-bottom:12px;">
            <div style="font-family:Georgia, serif; font-weight:bold; font-size:15px; color:#D4AF37;">Transparency & Accountability</div>
          </td>
        </tr>
        <tr>
          <td style="font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; line-height:1.6;">
            ${props.transparencySummary}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ` : ''}

  <!-- CTA BUTTON -->
  ${props.ctaLink && props.ctaText ? `
  <tr>
    <td align="center" style="padding:30px 0 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#EFE5C9; border-radius:6px;">
            <a href="${props.ctaLink}" style="display:inline-block; padding:12px 24px; font-family:Arial, Helvetica, sans-serif; font-size:12px; font-weight:bold; color:#1A1406; text-decoration:none; letter-spacing:0.5px; text-transform:uppercase;">${props.ctaText}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ` : ''}

  <!-- DUA -->
  ${props.dua ? `
  <tr>
    <td align="center" style="padding:46px 6px 0;">
      <div style="font-family:Georgia, serif; font-size:17px; color:#E9D9AE; direction:rtl; line-height:1.6;">${props.dua.arabic}</div>
      <div style="font-family:Georgia, serif; font-style:italic; font-size:12.5px; color:#8A93A6; margin-top:12px; line-height:1.6; max-width:420px;">${props.dua.english}</div>
    </td>
  </tr>
  ` : ''}

  <!-- SIGN OFF -->
  ${props.signOff ? `
  <tr>
    <td style="padding:44px 6px 0;">
      <p style="font-family:Georgia, serif; font-size:14.5px; color:#C3C7CE; margin:0;">
        ${props.signOff}
      </p>
    </td>
  </tr>
  ` : ''}

  <!-- FOOTER -->
  <tr>
    <td style="padding:44px 6px 0; border-top:1px solid rgba(255,255,255,0.07);">
      <p style="font-family:Arial, Helvetica, sans-serif; font-size:11.5px; color:#545D6E; line-height:1.7; margin:26px 0 0;">
        This communication has been generated from verified records approved by Daarayn Foundation Trust. Amanah, transparency, and accountability are the core pillars of our foundation.
      </p>
      <p style="font-family:Arial, Helvetica, sans-serif; font-size:11.5px; color:#545D6E; margin:14px 0 0;">
        Questions? Write to us at <a href="mailto:${process.env.SMTP_USER || "info@daarayn.org"}" style="color:#C9A24B; text-decoration:none;">${process.env.SMTP_USER || "info@daarayn.org"}</a>
      </p>
      <p style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#3E4653; margin:18px 0 0;">
        &copy; ${new Date().getFullYear()} Daarayn Foundation. All rights reserved.
      </p>
    </td>
  </tr>

</table>

</td>
</tr>
</table>
</body>
</html>
  `;
}

// Helper to provide the embedded logo for email clients
export function attachDaaraynLogo() {
  const fs = require('fs');
  try {
    const filePath = path.join(process.cwd(), 'public', 'email logo', 'daarayn-emblem.png.png');
    const content = fs.readFileSync(filePath);
    return [{
      filename: 'daarayn-emblem.png',
      content: content,
      contentType: 'image/png',
      contentDisposition: 'inline',
      cid: 'logo@daarayn.org' // Matches the CID in HTML template
    }];
  } catch (e) {
    console.error("Could not load logo for email attachment:", e);
    return [];
  }
}

// ─────────────────────────────────────────────
// PROJECT UPDATE EMAIL
// ─────────────────────────────────────────────
export async function sendProjectUpdateEmail(
  recipientEmail: string,
  subject: string,
  message: string
): Promise<EmailResult> {
  console.log(`[EmailService] sendProjectUpdateEmail → ${recipientEmail}`);

  const html = generateLetterEmailTemplate({
    title: "Project Update — Daarayn Foundation",
    eyebrow: "VERIFIED PROJECT UPDATE",
    headline: "New developments from the field",
    greeting: "Assalamu Alaikum,",
    bodyParagraphs: message.split('\n\n').map(p => p.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong style='color:#F2EEE3;'>$1</strong>")),
    pullQuote: "Every rupee you donate is tracked, documented, and permanently recorded on our public ledger — ensuring complete transparency.",
    postQuoteParagraph: "You can view the full progress details and field notes on your dashboard.",
    ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
    ctaText: "View update details &rarr;",
    dua: {
      arabic: "رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ",
      english: "Our Lord, accept [this] from us. Indeed You are the Hearing, the Knowing."
    },
    signOff: `With gratitude,<br><span style="color:#F2EEE3;">The Daarayn Foundation team</span>`
  });

  return sendEmail({ 
    to: recipientEmail, 
    subject, 
    html,
    attachments: attachDaaraynLogo() 
  });
}

// ─────────────────────────────────────────────
// DONATION ACKNOWLEDGEMENT EMAIL
// ─────────────────────────────────────────────
export async function sendAcknowledgementEmail(
  recipientEmail: string,
  donorName: string,
  amount: number,
  donationId?: string,
  currency = "INR"
): Promise<EmailResult> {
  console.log(`[EmailService] sendAcknowledgementEmail → ${recipientEmail}`);

  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amount);

  const html = generateLetterEmailTemplate({
    title: "Donation Received — Daarayn Foundation",
    eyebrow: "VERIFIED CONTRIBUTION",
    headline: "JazakAllah Khair for your trust",
    greeting: `Assalamu Alaikum, ${donorName},`,
    bodyParagraphs: [
      `We're writing to confirm that your generous donation of <strong style="color:#F2EEE3;">${formattedAmount}</strong> has been successfully received and securely recorded in our ledger.`,
      "Your contribution is currently being processed. We will notify you the moment your funds are actively allocated to a specific cause or project."
    ],
    pullQuote: "Indeed, those who give charity, men and women, and lend to Allah a goodly loan — it will be multiplied for them, and they will have a noble reward.",
    postQuoteParagraph: "You can track your donation history and upcoming allocations at any time.",
    ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
    ctaText: "View your donor profile &rarr;",
    dua: {
      arabic: "بَارَكَ اللَّهُ لَكَ فِي أَهْلِكَ وَمَالِكَ",
      english: "May Allah bless you in your family and your wealth."
    },
    signOff: `With gratitude,<br><span style="color:#F2EEE3;">The Daarayn Foundation team</span>`
  });

  return sendEmail({
    to: recipientEmail,
    subject: `Thank You for Your Sadaqah — Daarayn ${donationId ? `(${donationId})` : ""}`,
    html,
    attachments: attachDaaraynLogo()
  });
}

// ─────────────────────────────────────────────
// ALLOCATION CONFIRMATION EMAIL
// ─────────────────────────────────────────────
export async function sendAllocationEmail(
  recipientEmail: string,
  donorName: string,
  projectTitle: string,
  allocatedAmount: number,
  currency = "INR"
): Promise<EmailResult> {
  console.log(`[EmailService] sendAllocationEmail → ${recipientEmail}`);

  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(allocatedAmount);

  const html = generateLetterEmailTemplate({
    title: "Allocation Confirmed — Daarayn Foundation",
    eyebrow: "ALLOCATION CONFIRMED",
    headline: "Your gift is now at work",
    greeting: `Assalamu Alaikum, ${donorName},`,
    bodyParagraphs: [
      `We're writing to let you know that a portion of your donation, <strong style="color:#F2EEE3;">${formattedAmount}</strong>, has now been officially allocated toward the <strong style="color:#F2EEE3;">${projectTitle}</strong>, and has moved into active deployment on the ground.`,
      "What this means in practice: your contribution is no longer sitting in a queue. Our field team has already begun putting it to use, and we'll be sending you verified updates as the work progresses."
    ],
    pullQuote: "Every rupee you donate is tracked, documented, and permanently recorded on our public ledger — so this contribution, and every one before it, remains fully accountable to you.",
    postQuoteParagraph: "You can follow this allocation from here, including field notes and disbursement records, at any time.",
    ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
    ctaText: "Track your impact &rarr;",
    dua: {
      arabic: "رَبَّنَا آتِنَا فِى الدُّنْيَا حَسَنَةً وَفِى الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
      english: "Our Lord, give us in this world that which is good and in the Hereafter that which is good, and protect us from the punishment of the Fire."
    },
    signOff: `With gratitude,<br><span style="color:#F2EEE3;">The Daarayn Foundation team</span>`
  });

  return sendEmail({
    to: recipientEmail,
    subject: `Donation Deployed: Creating Impact for ${projectTitle}`,
    html,
    attachments: attachDaaraynLogo()
  });
}

// ─────────────────────────────────────────────
// CERTIFICATE EMAIL
// ─────────────────────────────────────────────
export async function sendCertificateEmail(
  recipientEmail: string,
  donorName: string,
  totalDonated?: number,
  year?: number
): Promise<EmailResult> {
  console.log(`[EmailService] sendCertificateEmail → ${recipientEmail}`);

  const fiscalYear = year || new Date().getFullYear();
  const formattedTotal = totalDonated 
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(totalDonated)
    : "";

  const html = generateLetterEmailTemplate({
    title: `Donation Certificate ${fiscalYear} — Daarayn Foundation`,
    eyebrow: "OFFICIAL DOCUMENT",
    headline: "Your Annual Donation Certificate",
    greeting: `Assalamu Alaikum, ${donorName},`,
    bodyParagraphs: [
      `Please find attached your official Donation Certificate for the fiscal year <strong style="color:#F2EEE3;">${fiscalYear}</strong>.`,
      ...(formattedTotal ? [`Your total recorded contributions for this period amount to <strong style="color:#F2EEE3;">${formattedTotal}</strong>.`] : []),
      "This certificate serves as an official record of your charitable contributions to Daarayn Foundation and may be used for tax purposes where applicable."
    ],
    pullQuote: "Amanah and transparency are the core pillars of our foundation. Every transaction is meticulously recorded to honor your trust.",
    postQuoteParagraph: "You can view and download all your past certificates directly from your dashboard.",
    ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
    ctaText: "View your certificates &rarr;",
    dua: {
      arabic: "أَجَرَكَ اللَّهُ فِيمَا أَعْطَيْتَ، وَبَارَكَ لَكَ فِيمَا أَبْقَيْتَ، وَجَعَلَهُ لَكَ طَهُورًا",
      english: "May Allah reward you for what you have given, and bless you in what you have kept, and make it a purification for you."
    },
    signOff: `With gratitude,<br><span style="color:#F2EEE3;">The Daarayn Foundation team</span>`
  });

  return sendEmail({
    to: recipientEmail,
    subject: `Official Donation Certificate ${fiscalYear} — Daarayn Foundation`,
    html,
    attachments: attachDaaraynLogo()
  });
}

// ─────────────────────────────────────────────
// ANNUAL REPORT EMAIL
// ─────────────────────────────────────────────
export async function sendAnnualReportEmail(
  recipientEmail: string,
  donorName: string,
  reportYear: number,
  reportUrl?: string
): Promise<EmailResult> {
  console.log(`[EmailService] sendAnnualReportEmail → ${recipientEmail}`);

  const html = generateLetterEmailTemplate({
    title: `${reportYear} Annual Impact Report — Daarayn Foundation`,
    eyebrow: "ANNUAL IMPACT REPORT",
    headline: "Another year of impactful giving",
    greeting: `Assalamu Alaikum, ${donorName},`,
    bodyParagraphs: [
      `Alhamdulillah. We are honored to share our <strong style="color:#F2EEE3;">${reportYear} Annual Impact Report</strong> with you. Your unwavering trust in Daarayn makes all of this possible.`,
      "Inside, you will find complete details on total donations received and disbursed, projects completed, families supported, students sponsored, and our fully verified financial statements."
    ],
    pullQuote: "And whatever you spend of good - it will be fully repaid to you, and you will not be wronged.",
    postQuoteParagraph: "We hold ourselves strictly accountable. Our Annual Report is thoroughly vetted to guarantee absolute transparency in every endeavor.",
    ctaLink: reportUrl || `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/reports/${reportYear}`,
    ctaText: "Read the full report &rarr;",
    dua: {
      arabic: "رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ",
      english: "Our Lord, accept [this] from us. Indeed You are the Hearing, the Knowing."
    },
    signOff: `With gratitude,<br><span style="color:#F2EEE3;">The Daarayn Foundation team</span>`
  });

  return sendEmail({
    to: recipientEmail,
    subject: `Daarayn ${reportYear} Annual Impact Report — Your Sadaqah In Numbers`,
    html,
    attachments: attachDaaraynLogo()
  });
}
