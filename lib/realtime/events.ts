/**
 * lib/realtime/events.ts
 *
 * The event contract shared by publishers (API routes) and subscribers
 * (pages). Imported on both server and client.
 *
 * Donation-related events carry only identifiers. Subscribers react by
 * re-reading the authoritative data through their authenticated APIs, so no
 * donor details travel over the event stream.
 */

export const RealtimeEvent = {
  // Donation data — payload: { id, status? }
  DONATION_CREATED: "DONATION_CREATED",
  DONATION_UPDATED: "DONATION_UPDATED",
  DONOR_UPDATED: "DONOR_UPDATED",
  CAUSE_UPDATED: "CAUSE_UPDATED",

  // Notifications
  NOTIFICATION_CREATED: "NOTIFICATION_CREATED",
  NOTIFICATION_UPDATED: "NOTIFICATION_UPDATED",
  NOTIFICATION_DELETED: "NOTIFICATION_DELETED",

  // Field operations
  FIELD_REPORT_SUBMITTED: "FIELD_REPORT_SUBMITTED",
  FIELD_REPORT_UPDATE: "FIELD_REPORT_UPDATE",
  FIELD_REPORT_UPDATED: "FIELD_REPORT_UPDATED",
  FIELD_AGENT_CREATED: "FIELD_AGENT_CREATED",
  FIELD_AGENT_UPDATED: "FIELD_AGENT_UPDATED",
  CHAT_MESSAGE: "CHAT_MESSAGE",
  CONVERSATION_UPDATED: "CONVERSATION_UPDATED",

  // Communications broadcast progress (transient, same-instance only)
  BROADCAST_PROGRESS: "BROADCAST_PROGRESS",
  BROADCAST_COMPLETED: "BROADCAST_COMPLETED",

  // Stream control
  CONNECTED: "CONNECTED",
  /** The server could not replay what this client missed: re-read everything. */
  RESYNC: "RESYNC",
} as const;

export type RealtimeEventType = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** Everything that can change a donation figure anywhere in the admin. */
export const DONATION_DATA_EVENTS: readonly string[] = [
  RealtimeEvent.DONATION_CREATED,
  RealtimeEvent.DONATION_UPDATED,
  RealtimeEvent.DONOR_UPDATED,
  RealtimeEvent.CAUSE_UPDATED,
];

export const NOTIFICATION_EVENTS: readonly string[] = [
  RealtimeEvent.NOTIFICATION_CREATED,
  RealtimeEvent.NOTIFICATION_UPDATED,
  RealtimeEvent.NOTIFICATION_DELETED,
];

/** Who may receive an event: all admins, or one field agent. */
export type Audience = "admin" | `agent:${string}`;

export interface RealtimeMessage {
  /** Position in the shared event log; absent for transient events. */
  id?: string;
  type: string;
  payload?: any;
  at?: string;
}
