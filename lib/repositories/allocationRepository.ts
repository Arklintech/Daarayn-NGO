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
