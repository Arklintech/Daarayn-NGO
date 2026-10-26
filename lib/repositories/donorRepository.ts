import { BaseRepository } from "./baseRepository";
import { DonorProfile } from "../db";
import { sheetsService } from "../google/sheets";
import { contactKeys, normalizeEmail, normalizePhone } from "../donors/normalize";

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
  "emailSuppressed",
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
      emailSuppressed: ["true", "yes", "1"].includes(String(row.emailSuppressed).toLowerCase()),
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
      emailSuppressed: Boolean(donor.emailSuppressed),
    };
  }

  public async findByEmail(email: string): Promise<DonorProfile | null> {
    const all = await this.getAll();
    return all.find((d) => d.email.toLowerCase() === email.toLowerCase()) || null;
  }

  /** Exact match on a normalised email or phone; never on name. Earliest row wins if the sheet already holds duplicates. */
  public async findByContact(contact: string, forceRefresh = false): Promise<DonorProfile | null> {
    const keys = contactKeys(contact);
    if (!keys.email && !keys.phone) return null;
    const all = await this.getAll(forceRefresh);
    return (
      all.find(
        (d) =>
          (keys.email && normalizeEmail(d.email) === keys.email) ||
          (keys.phone && normalizePhone(d.phone) === keys.phone)
      ) || null
    );
  }

  /**
   * Returns the donor for this contact, creating exactly one profile (and one
   * permanent Donor Token) when the person is new.
   *
   * Concurrency: calls for the same contact in this process are serialised.
   * Across serverless instances the sheet decides: the new row is appended
   * first, then the tab is re-read; if another row with the same contact sits
   * above ours, ours is cleared and the earlier donor is returned (earliest row
   * wins, so concurrent creators converge on one profile). The token is
   * verified to be unique before it is returned. A failed Sheets write throws.
   */
  public async findOrCreateByContact(
    contact: string,
    build: (id: string) => DonorProfile
  ): Promise<DonorLookup> {
    const keys = contactKeys(contact);
    if (!keys.email && !keys.phone) {
      throw new Error("A valid email address or phone number is required to identify the donor.");
    }
    const lockKey = keys.email || keys.phone;
    const previous = donorLocks.get(lockKey) || Promise.resolve();
    const run = previous.then(() => this.createOrFind(keys, build));
    const tail = run.then(() => undefined, () => undefined);
    donorLocks.set(lockKey, tail);
    try {
      return await run;
    } finally {
      if (donorLocks.get(lockKey) === tail) donorLocks.delete(lockKey);
    }
  }

  /** Updates a donor row whose position and contents were just read (no extra Sheets read). Extra sheet columns are preserved. */
  public async saveKnownRow(rowNumber: number, raw: Record<string, any>, donor: DonorProfile): Promise<void> {
    await sheetsService.updateRowAt(this.sheetName, rowNumber, { ...raw, ...this.mapEntityToRow(donor) });
    this.invalidateCache();
  }

  private matchRows(rows: { rowNumber: number; record: Record<string, any> }[], keys: { email: string; phone: string }) {
    return rows.filter(
      (r) =>
        (keys.email && normalizeEmail(r.record.email) === keys.email) ||
        (keys.phone && normalizePhone(r.record.phone) === keys.phone)
    );
  }

  private async createOrFind(
    keys: { email: string; phone: string },
    build: (id: string) => DonorProfile
  ): Promise<DonorLookup> {
    await this.init();
    let { rows } = await sheetsService.getRowsWithNumbers(this.sheetName);
    const existing = this.matchRows(rows, keys)[0];
    if (existing) {
      this.invalidateCache();
      return { donor: this.mapRowToEntity(existing.record), created: false, rowNumber: existing.rowNumber, raw: existing.record };
    }

    let donor = build(generateDonorToken());
    const myRow = await sheetsService.appendRow(this.sheetName, this.mapEntityToRow(donor), this.headers);

    for (let attempt = 0; attempt < 5; attempt++) {
      ({ rows } = await sheetsService.getRowsWithNumbers(this.sheetName));
      const earlier = this.matchRows(rows, keys).filter((r) => r.rowNumber < myRow);
      if (earlier.length > 0) {
        await sheetsService.clearRowAt(this.sheetName, myRow);
        this.invalidateCache();
        return { donor: this.mapRowToEntity(earlier[0].record), created: false, rowNumber: earlier[0].rowNumber, raw: earlier[0].record };
      }
      const sameToken = rows.filter((r) => String(r.record.id) === donor.id);
      if (sameToken.length <= 1) {
        this.invalidateCache();
        return { donor, created: true, rowNumber: myRow, raw: this.mapEntityToRow(donor) };
      }
      // Token collision (practically impossible): issue a fresh token to our row only.
      donor = { ...donor, id: generateDonorToken() };
      await sheetsService.updateRowAt(this.sheetName, myRow, this.mapEntityToRow(donor));
    }
    throw new Error("Could not allocate a unique Donor Token; retry the submission.");
  }
}

export interface DonorLookup {
  donor: DonorProfile;
  created: boolean;
  /** Sheet row of the donor and the raw row as just read, so a follow-up update needs no extra read. */
  rowNumber: number;
  raw: Record<string, any>;
}

const donorLocks = new Map<string, Promise<unknown>>();

/** Permanent Donor Token. Format kept from the existing system: DNR-<base36 time>-<4 random>. */
export function generateDonorToken(): string {
  return `DNR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0")}`;
}

export const donorRepository = new DonorRepository();
