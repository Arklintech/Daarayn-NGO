/**
 * Browser-safe selection rules for the public donation form (no server imports, so it can ship in the client bundle).
 * Mirrors `normalizeSelection` in ./selection: "general" (unrestricted) and specific causes are mutually exclusive, and
 * an empty selection falls back to general. Keeps what the donor sees equal to what the server records.
 */
export const GENERAL_CAUSE_ID = "general";

export function toggleDonationCause(current: string[], causeId: string): string[] {
  if (causeId === GENERAL_CAUSE_ID) return [GENERAL_CAUSE_ID];
  const specific = current.filter((id) => id !== GENERAL_CAUSE_ID);
  const next = specific.includes(causeId) ? specific.filter((id) => id !== causeId) : [...specific, causeId];
  return next.length ? next : [GENERAL_CAUSE_ID];
}
