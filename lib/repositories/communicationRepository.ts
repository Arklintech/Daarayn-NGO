import { BaseRepository } from "./baseRepository";

export interface CommunicationRecord {
  id: string; // COM-YYYY-XXXXXX
  type: string;
  subject: string;
  bodyText?: string;
  selectedCauses: string[];
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: "Draft" | "Queued" | "Sending" | "Completed" | "Failed";
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

const COMMUNICATION_HEADERS = [
  "id",
  "type",
  "subject",
  "bodyText",
  "selectedCauses",
  "recipientCount",
  "sentCount",
  "failedCount",
  "status",
  "createdBy",
  "createdAt",
  "completedAt",
];

export class CommunicationRepository extends BaseRepository<CommunicationRecord> {
  constructor() {
    super("Communications", COMMUNICATION_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): CommunicationRecord {
    const safeParse = (val: any) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try {
        return JSON.parse(val);
      } catch {
        return String(val).split(",");
      }
    };

    return {
      id: String(row.id || row.ID || ""),
      type: String(row.type || "Email"),
      subject: String(row.subject || ""),
      bodyText: String(row.bodyText || ""),
      selectedCauses: safeParse(row.selectedCauses),
      recipientCount: Number(row.recipientCount || 0),
      sentCount: Number(row.sentCount || 0),
      failedCount: Number(row.failedCount || 0),
      status: (row.status || "Completed") as any,
      createdBy: String(row.createdBy || "Admin"),
      createdAt: String(row.createdAt || new Date().toISOString()),
      completedAt: String(row.completedAt || ""),
    };
  }

  protected mapEntityToRow(comm: CommunicationRecord): Record<string, any> {
    return {
      id: comm.id,
      type: comm.type,
      subject: comm.subject,
      bodyText: comm.bodyText || "",
      selectedCauses: JSON.stringify(comm.selectedCauses || []),
      recipientCount: comm.recipientCount,
      sentCount: comm.sentCount,
      failedCount: comm.failedCount,
      status: comm.status,
      createdBy: comm.createdBy,
      createdAt: comm.createdAt,
      completedAt: comm.completedAt || "",
    };
  }
}

export const communicationRepository = new CommunicationRepository();
