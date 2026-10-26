import { BaseRepository } from "./baseRepository";

export interface AllocationEntity {
  id: string;
  donationId: string;
  donorId: string;
  donorName: string;
  projectId?: string;
  caseId?: string;
  targetTitle: string;
  allocatedAmount: number;
  allocationDate: string;
  adminEmail: string;
  status: "active" | "reversed";
  notes?: string;
  createdAt?: string;
  /** Cause this allocation draws on, and the Donation_Causes row (designation) it is traceable to. */
  causeId?: string;
  designationId?: string;
  /** Google Drive file ids of supporting evidence (only ever set after the upload succeeded). */
  evidenceDriveFileIds?: string[];
  /** Idempotency key: a retried request with the same key returns the existing allocation. */
  requestKey?: string;
  reversedReason?: string;
  reversedAt?: string;
  reversedBy?: string;
}

const ALLOCATION_HEADERS = [
  "id",
  "donationId",
  "donorId",
  "donorName",
  "projectId",
  "caseId",
  "targetTitle",
  "allocatedAmount",
  "allocationDate",
  "adminEmail",
  "status",
  "notes",
  "createdAt",
  "causeId",
  "designationId",
  "evidenceDriveFileIds",
  "requestKey",
  "reversedReason",
  "reversedAt",
  "reversedBy",
];

export class AllocationRepository extends BaseRepository<AllocationEntity> {
  constructor() {
    super("Allocations", ALLOCATION_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): AllocationEntity {
    return {
      id: String(row.id || ""),
      donationId: String(row.donationId || ""),
      donorId: String(row.donorId || ""),
      donorName: String(row.donorName || ""),
      projectId: String(row.projectId || ""),
      caseId: String(row.caseId || ""),
      targetTitle: String(row.targetTitle || ""),
      allocatedAmount: Number(row.allocatedAmount || 0),
      allocationDate: String(row.allocationDate || new Date().toISOString()),
      adminEmail: String(row.adminEmail || ""),
      status: (row.status || "active") as "active" | "reversed",
      notes: String(row.notes || ""),
      createdAt: String(row.createdAt || new Date().toISOString()),
      causeId: String(row.causeId || ""),
      designationId: String(row.designationId || ""),
      evidenceDriveFileIds: (() => {
        try {
          const v = JSON.parse(String(row.evidenceDriveFileIds || "[]"));
          return Array.isArray(v) ? v.map(String) : [];
        } catch {
          return [];
        }
      })(),
      requestKey: String(row.requestKey || ""),
      reversedReason: String(row.reversedReason || ""),
      reversedAt: String(row.reversedAt || ""),
      reversedBy: String(row.reversedBy || ""),
    };
  }

  protected mapEntityToRow(allocation: AllocationEntity): Record<string, any> {
    return {
      id: allocation.id,
      donationId: allocation.donationId,
      donorId: allocation.donorId,
      donorName: allocation.donorName,
      projectId: allocation.projectId || "",
      caseId: allocation.caseId || "",
      targetTitle: allocation.targetTitle,
      allocatedAmount: allocation.allocatedAmount,
      allocationDate: allocation.allocationDate,
      adminEmail: allocation.adminEmail,
      status: allocation.status,
      notes: allocation.notes || "",
      createdAt: allocation.createdAt || new Date().toISOString(),
      causeId: allocation.causeId || "",
      designationId: allocation.designationId || "",
      evidenceDriveFileIds: JSON.stringify(allocation.evidenceDriveFileIds || []),
      requestKey: allocation.requestKey || "",
      reversedReason: allocation.reversedReason || "",
      reversedAt: allocation.reversedAt || "",
      reversedBy: allocation.reversedBy || "",
    };
  }

  /**
   * Find allocations by projectId
   */
  async getByProjectId(projectId: string): Promise<AllocationEntity[]> {
    const all = await this.getAll();
    return all.filter((a) => a.projectId === projectId);
  }

  /**
   * Find allocations by caseId
   */
  async getByCaseId(caseId: string): Promise<AllocationEntity[]> {
    const all = await this.getAll();
    return all.filter((a) => a.caseId === caseId);
  }

  /**
   * Find active allocations linked to a project or case
   */
  async getActiveForTarget(projectId?: string, caseId?: string): Promise<AllocationEntity[]> {
    const all = await this.getAll();
    return all.filter(
      (a) =>
        a.status === "active" &&
        ((projectId && a.projectId === projectId) ||
         (caseId && a.caseId === caseId))
    );
  }

  /**
   * Group allocations by donorId
   */
  async groupByDonor(projectId?: string, caseId?: string): Promise<Map<string, { totalAmount: number; donorName: string; allocations: AllocationEntity[] }>> {
    const allocations = await this.getActiveForTarget(projectId, caseId);
    const map = new Map<string, { totalAmount: number; donorName: string; allocations: AllocationEntity[] }>();

    allocations.forEach((a) => {
      const existing = map.get(a.donorId) || {
        totalAmount: 0,
        donorName: a.donorName,
        allocations: [],
      };
      existing.totalAmount += a.allocatedAmount;
      existing.allocations.push(a);
      map.set(a.donorId, existing);
    });

    return map;
  }
}

export const allocationRepository = new AllocationRepository();
