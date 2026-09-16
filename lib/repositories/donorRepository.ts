import { BaseRepository } from "./baseRepository";
import { DonorProfile } from "../db";

const DONOR_HEADERS = [
  "id",
  "name",
  "email",
  "phone",
  "country",
  "city",
  "donationPreference",
  "communicationPreference",
  "dateJoined",
  "totalDonations",
  "totalAmountDonated",
  "projectsSupportedCount",
  "casesSupportedCount",
  "donationHistory",
  "projectsSupported",
  "casesSupported",
  "status",
];

export class DonorRepository extends BaseRepository<DonorProfile> {
  constructor() {
    super("Donors", DONOR_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): DonorProfile {
    const safeParseArray = (val: any): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return String(val).split(",").map((s) => s.trim()).filter(Boolean);
      }
    };

    return {
      id: String(row.id || row.ID || ""),
      name: String(row.name || ""),
      email: String(row.email || ""),
      phone: String(row.phone || ""),
      country: String(row.country || ""),
      city: String(row.city || ""),
      donationPreference: String(row.donationPreference || "General Fund"),
      communicationPreference: String(row.communicationPreference || "Email"),
      dateJoined: String(row.dateJoined || new Date().toISOString()),
      totalDonations: Number(row.totalDonations || 0),
      totalAmountDonated: Number(row.totalAmountDonated || 0),
      projectsSupportedCount: Number(row.projectsSupportedCount || 0),
      casesSupportedCount: Number(row.casesSupportedCount || 0),
      donationHistory: safeParseArray(row.donationHistory),
      projectsSupported: safeParseArray(row.projectsSupported),
      casesSupported: safeParseArray(row.casesSupported),
      status: (row.status === "inactive" ? "inactive" : "active") as "active" | "inactive",
    };
  }

  protected mapEntityToRow(donor: DonorProfile): Record<string, any> {
    return {
      id: donor.id,
      name: donor.name,
      email: donor.email,
      phone: donor.phone,
      country: donor.country,
      city: donor.city,
      donationPreference: donor.donationPreference,
      communicationPreference: donor.communicationPreference,
      dateJoined: donor.dateJoined,
      totalDonations: donor.totalDonations,
      totalAmountDonated: donor.totalAmountDonated,
      projectsSupportedCount: donor.projectsSupportedCount,
      casesSupportedCount: donor.casesSupportedCount,
      donationHistory: JSON.stringify(donor.donationHistory || []),
      projectsSupported: JSON.stringify(donor.projectsSupported || []),
      casesSupported: JSON.stringify(donor.casesSupported || []),
      status: donor.status,
    };
  }

  public async findByEmail(email: string): Promise<DonorProfile | null> {
    const all = await this.getAll();
    return all.find((d) => d.email.toLowerCase() === email.toLowerCase()) || null;
  }

  public async findByContact(contact: string): Promise<DonorProfile | null> {
    const all = await this.getAll();
    const clean = contact.toLowerCase().trim();
    if (!clean) return null;
    return (
      all.find(
        (d) =>
          (d.email && d.email.toLowerCase().trim() === clean) ||
          (d.phone && d.phone.trim() === clean)
      ) || null
    );
  }
}

export const donorRepository = new DonorRepository();
