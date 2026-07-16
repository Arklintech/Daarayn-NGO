/**
 * lib/ai/knowledge/dateUtils.ts
 * Normalizes donation dates from Firestore (ISO, DD/MM/YYYY, timestamps).
 */

export function normalizeDateField(raw: unknown): string {
  if (!raw) return "";

  if (typeof raw === "object" && raw !== null && "seconds" in (raw as object)) {
    const ts = raw as { seconds: number };
    return formatIST(new Date(ts.seconds * 1000));
  }

  if (raw instanceof Date) {
    return formatIST(raw);
  }

  const str = String(raw).trim();
  if (!str) return "";

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatIST(parsed);
  }

  return str;
}

export function formatIST(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getISTToday(): string {
  return formatIST(new Date());
}

export function getISTDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatIST(d);
}

export function isDateOnDay(normalizedDate: string, dayStr: string): boolean {
  if (!normalizedDate || !dayStr) return false;
  const d = normalizeDateField(normalizedDate);
  return d === dayStr || d.startsWith(dayStr);
}

export function isDateInMonth(normalizedDate: string, monthPrefix: string): boolean {
  const d = normalizeDateField(normalizedDate);
  return d.startsWith(monthPrefix);
}

export function isDateInRange(normalizedDate: string, start: string, end: string): boolean {
  const d = normalizeDateField(normalizedDate);
  return d >= start && d <= end;
}
