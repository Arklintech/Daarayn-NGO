/**
 * lib/ai/schemas/certificate.ts
 *
 * Schema definitions for generated certificate contents.
 */

export interface CertificateSchema {
  donorName: string;
  certificateId: string;
  dateGenerated: string;
  totalDonationText: string;
  trusteeSignatory: string;
  blessingDua: string;
  confidenceScore: number;
}
