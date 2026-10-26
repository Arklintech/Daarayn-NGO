/**
 * lib/realtime/eventLog.ts
 *
 * Append-only event log kept in the Realtime_Events tab of the operational
 * spreadsheet. Vercel runs the app on several instances, so an event emitted
 * in one function never reaches SSE clients attached to another through
 * process memory. Every instance that has clients connected reads new rows
 * from this log instead; the row number is the event id clients resume from.
 */

import { getSheetsClient, GOOGLE_SHEET_ID } from "../google/client";
import { sheetsService } from "../google/sheets";
import { withGoogleRetry } from "../google/retry";
import type { Audience, RealtimeMessage } from "./events";

const SHEET = "Realtime_Events";
const HEADERS = ["eventId", "type", "audience", "payload", "createdAt", "origin"];
const MAX_PAYLOAD_CHARS = 20_000;

export interface LoggedEvent {
  message: RealtimeMessage;
  audience: string[];
  origin: string;
}

let ready: Promise<void> | null = null;

function ensureLog(): Promise<void> {
  if (!ready) {
    ready = sheetsService.ensureSheetExists(SHEET, HEADERS).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

function client() {
  const sheets = getSheetsClient();
  if (!sheets) throw new Error("Google Sheets client is not initialized.");
  return sheets;
}

/** Writes one event and returns its row number (the event id). */
export async function appendEvent(type: string, payload: unknown, audience: Audience[], origin: string, at: string): Promise<number> {
  await ensureLog();
  let json = JSON.stringify(payload ?? null);
  if (json.length > MAX_PAYLOAD_CHARS) json = JSON.stringify({ truncated: true });
  return sheetsService.appendRow(
    SHEET,
    {
      eventId: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      audience: audience.join(" "),
      payload: json,
      createdAt: at,
      origin,
    },
    HEADERS
  );
}

/** Writes several events in ONE request; returns the row number of the first (ids are consecutive). */
export async function appendEvents(events: { type: string; payload: unknown; audience: Audience[] }[], origin: string, at: string): Promise<number> {
  await ensureLog();
  const records = events.map((e) => {
    let json = JSON.stringify(e.payload ?? null);
    if (json.length > MAX_PAYLOAD_CHARS) json = JSON.stringify({ truncated: true });
    return {
      eventId: `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: e.type,
      audience: e.audience.join(" "),
      payload: json,
      createdAt: at,
      origin,
    };
  });
  return sheetsService.appendRows(SHEET, records, HEADERS);
}

/** Row number of the newest event (1 when the log only has its header row). */
export async function lastEventRow(): Promise<number> {
  await ensureLog();
  const res = await withGoogleRetry(() => client().spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: `'${SHEET}'!A:A` }), { label: "event log end" });
  return Math.max(1, res.data.values?.length || 1);
}

/** Events stored at rows `fromRow` … `fromRow + maxRows - 1`, plus the row to read next. */
export async function readEventsFrom(fromRow: number, maxRows = 200): Promise<{ events: LoggedEvent[]; nextRow: number }> {
  await ensureLog();
  const start = Math.max(2, fromRow);
  const res = await withGoogleRetry(() => client().spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: `'${SHEET}'!A${start}:F${start + maxRows - 1}` }), { label: "event log read" });
  const values = res.data.values || [];
  const events: LoggedEvent[] = [];
  values.forEach((row, i) => {
    const [, type, audience, payload, createdAt, origin] = row || [];
    if (!type) return;
    let parsed: any = null;
    try {
      parsed = payload ? JSON.parse(payload) : null;
    } catch {
      parsed = null;
    }
    events.push({
      message: { id: String(start + i), type: String(type), payload: parsed, at: String(createdAt || "") },
      audience: String(audience || "admin").split(/\s+/).filter(Boolean),
      origin: String(origin || ""),
    });
  });
  return { events, nextRow: start + values.length };
}
