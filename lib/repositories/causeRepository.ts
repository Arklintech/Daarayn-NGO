import { BaseRepository } from "./baseRepository";

export interface Cause {
  id: string; // CAUSE-YYYY-XXXXXX
  title: string;
  category: string;
  targetAmount: number;
  raisedAmount: number;
  location: string;
  description: string;
  status: "Active" | "Completed" | "Urgent";
  imageUrl?: string;
  driveFileId?: string;
  createdAt: string;
}

const CAUSE_HEADERS = [
  "id",
  "title",
  "category",
  "targetAmount",
  "raisedAmount",
  "location",
  "description",
  "status",
  "imageUrl",
  "driveFileId",
  "createdAt",
];

export class CauseRepository extends BaseRepository<Cause> {
  constructor() {
    super("Causes", CAUSE_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): Cause {
    return {
      id: String(row.id || row.ID || ""),
      title: String(row.title || ""),
      category: String(row.category || "General"),
      targetAmount: Number(row.targetAmount || 0),
      raisedAmount: Number(row.raisedAmount || 0),
      location: String(row.location || ""),
      description: String(row.description || ""),
      status: (row.status || "Active") as any,
      imageUrl: String(row.imageUrl || ""),
      driveFileId: String(row.driveFileId || ""),
      createdAt: String(row.createdAt || new Date().toISOString()),
    };
  }

  protected mapEntityToRow(cause: Cause): Record<string, any> {
    return {
      id: cause.id,
      title: cause.title,
      category: cause.category,
      targetAmount: cause.targetAmount,
      raisedAmount: cause.raisedAmount,
      location: cause.location,
      description: cause.description,
      status: cause.status,
      imageUrl: cause.imageUrl || "",
      driveFileId: cause.driveFileId || "",
      createdAt: cause.createdAt,
    };
  }
}

export const causeRepository = new CauseRepository();
