/**
 * lib/donors/normalize.ts
 *
 * Contact normalisation used to recognise a returning donor. Pure functions,
 * safe on server and client.
 *
 * Matching is deliberately conservative: only an exact normalised email or an
 * exact normalised phone number identifies a donor. Names are never used.
 */

export function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

/**
 * Digits only; a leading country code / trunk zero is dropped for 10-digit
 * national numbers (India), so "+91 98765-43210", "09876543210" and
 * "9876543210" are the same phone. Numbers with fewer than 7 digits are not
 * treated as a phone number at all.
 */
export function normalizePhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("@")) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(digits.length - 10);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : "";
}

export interface ContactKeys {
  email: string;
  phone: string;
}

/** Splits free-form donor contact input into its normalised identifiers. */
export function contactKeys(contact: unknown): ContactKeys {
  return { email: normalizeEmail(contact), phone: normalizePhone(contact) };
}

/** True when two donor records share at least one reliable identifier. */
export function sharesIdentifier(a: { email?: string; phone?: string }, b: { email?: string; phone?: string }): boolean {
  const ae = normalizeEmail(a.email);
  const ap = normalizePhone(a.phone);
  const be = normalizeEmail(b.email);
  const bp = normalizePhone(b.phone);
  return (!!ae && ae === be) || (!!ap && ap === bp);
}
