/**
 * lib/ai/schemas/communication.ts
 *
 * Schema definitions for standard AI-generated communications (emails/notifications).
 */

export interface CommunicationSchema {
  subject: string;
  preview: string;
  greeting: string;
  body: string;
  dua: string;
  cta: string;
  footer: string;
  confidenceScore: number;
}
