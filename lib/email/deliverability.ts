/**
 * lib/email/deliverability.ts
 *
 * Shared helpers that keep outgoing mail out of spam folders:
 *   - a real plain-text alternative for every HTML email
 *   - a From address aligned with the authenticated sender (SPF/DKIM/DMARC)
 *   - Reply-To and List-Unsubscribe headers
 *   - a public site URL that never falls back to localhost in production
 */

const DEFAULT_SENDER = "daaraynorg@gmail.com";
const DEFAULT_SENDER_NAME = "Daarayn Foundation";

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function domainOf(address: string): string {
  return address.split("@")[1] || "";
}

/** Public base URL used for links inside emails. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripQuotes(explicit).replace(/\/+$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;

  return "http://localhost:3000";
}

/** Mailbox that donors reply to and that unsubscribe requests go to. */
export function getReplyToAddress(): string {
  const replyTo = process.env.REPLY_TO_EMAIL || process.env.SMTP_USER || DEFAULT_SENDER;
  return extractAddress(stripQuotes(replyTo));
}

/**
 * Builds the From header. The address must belong to the same domain as the
 * account that authenticates the send, otherwise DMARC alignment fails and
 * Gmail/Outlook route the message to spam.
 */
export function getFromHeader(authenticatedUser?: string): string {
  const configured = stripQuotes(process.env.FROM_EMAIL || "");
  const nameMatch = configured.match(/^(.*?)\s*<[^>]+>$/);
  const displayName = (nameMatch ? stripQuotes(nameMatch[1]) : "") || DEFAULT_SENDER_NAME;

  if (!authenticatedUser) {
    return configured || `"${DEFAULT_SENDER_NAME}" <${DEFAULT_SENDER}>`;
  }

  const authAddress = extractAddress(authenticatedUser);
  const configuredAddress = configured ? extractAddress(configured) : "";

  if (configuredAddress && domainOf(configuredAddress) === domainOf(authAddress)) {
    return `"${displayName}" <${configuredAddress}>`;
  }

  if (configuredAddress) {
    console.warn(
      `[Email] FROM_EMAIL (${configuredAddress}) does not match the SMTP account domain (${domainOf(authAddress)}). ` +
        `Sending as ${authAddress} to keep SPF/DKIM/DMARC aligned.`
    );
  }
  return `"${displayName}" <${authAddress}>`;
}

/** Headers that mailbox providers expect from legitimate senders. */
export function getStandardHeaders(): Record<string, string> {
  const unsubscribe = getReplyToAddress();
  return {
    "List-Unsubscribe": `<mailto:${unsubscribe}?subject=Unsubscribe>`,
  };
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rarr: "→",
  larr: "←",
  copy: "©",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Converts an HTML email into a readable plain-text alternative.
 * A text part that matches the HTML content is a strong legitimacy signal;
 * a missing or garbled one (e.g. leaked CSS) is a common spam trigger.
 */
export function htmlToPlainText(html: string): string {
  const text = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, "").trim();
      if (href.startsWith("mailto:")) return cleanLabel || href.slice(7);
      return cleanLabel ? `${cleanLabel} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table)>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
