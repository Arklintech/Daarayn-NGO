/**
 * Next ID in a prefixed sequence such as FR001, FR002 …
 *
 * Uses the highest existing number rather than the row count, so deleted or
 * out-of-order rows can never cause a new record to reuse an existing ID.
 */
export function nextSequentialId(prefix: string, existingIds: string[], width = 3): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}
