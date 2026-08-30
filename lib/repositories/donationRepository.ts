import { BaseRepository } from "./baseRepository";
import { Donation } from "../db";

const DONATION_HEADERS = [
  "id",
  "donorId",
  "donorName",
  "donorEmail",
  "amount",
  "currency",
  "date",
  "status",
  "paymentMethod",
  "causeId",
  "causeTitle",
  "proofDriveFileId",
  "transactionReference",
  "notes",
];

export class DonationRepository extends BaseRepository<Donation> {
  constructor() {
    super("Donations", DONATION_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): Donation {
    return {
      id: String(row.id || row.ID || ""),
      donorId: String(row.donorId || ""),
      donorName: String(row.donorName || ""),
      donorEmail: String(row.donorEmail || ""),
      amount: Number(row.amount || 0),
      currency: String(row.currency || "INR"),
      date: String(row.date || new Date().toISOString()),
      status: (row.status || "Completed") as any,
      paymentMethod: String(row.paymentMethod || "Bank Transfer"),
      donationType: String(row.donationType || row.causeTitle || "General"),
      causeId: String(row.causeId || ""),
      causeTitle: String(row.causeTitle || ""),
      proofDriveFileId: String(row.proofDriveFileId || ""),
      transactionReference: String(row.transactionReference || ""),
      notes: String(row.notes || ""),
      selectedCauses: [],
    };
  }

  protected mapEntityToRow(donation: Donation): Record<string, any> {
    return {
      id: donation.id,
      donorId: donation.donorId,
      donorName: donation.donorName,
      donorEmail: donation.donorEmail,
      amount: donation.amount,
      currency: donation.currency,
      date: donation.date,
      status: donation.status,
      paymentMethod: donation.paymentMethod,
      causeId: donation.causeId || "",
      causeTitle: donation.causeTitle || "",
      proofDriveFileId: (donation as any).proofDriveFileId || (donation as any).receiptUrl || "",
      transactionReference: donation.transactionReference || "",
      notes: donation.notes || "",
    };
  }

  public async getByDonorId(donorId: string): Promise<Donation[]> {
    const all = await this.getAll();
    return all.filter((d) => d.donorId === donorId);
  }
}

export const donationRepository = new DonationRepository();
