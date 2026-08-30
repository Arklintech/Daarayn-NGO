import { BaseRepository } from "./baseRepository";
import { FieldReport, FieldAgent } from "../db-field-ops";

const FIELD_REPORT_HEADERS = [
  "id",
  "agentId",
  "agentName",
  "category",
  "title",
  "description",
  "urgency",
  "estimatedBudget",
  "location",
  "beneficiaries",
  "media",
  "documents",
  "status",
  "timelineStages",
  "assignedTo",
  "createdAt",
  "updatedAt",
];

export class FieldReportRepository extends BaseRepository<FieldReport> {
  constructor() {
    super("Field_Reports", FIELD_REPORT_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): FieldReport {
    const safeParse = (val: any, fallback: any) => {
      if (!val) return fallback;
      if (typeof val === "object") return val;
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    };

    return {
      id: String(row.id || row.ID || ""),
      agentId: String(row.agentId || ""),
      agentName: String(row.agentName || ""),
      category: String(row.category || ""),
      title: String(row.title || ""),
      description: String(row.description || ""),
      urgency: (row.urgency || "Medium") as any,
      estimatedBudget: String(row.estimatedBudget || "₹0"),
      location: safeParse(row.location, { country: "India", state: "", district: "", village: "" }),
      beneficiaries: safeParse(row.beneficiaries, { families: 0, children: 0, women: 0, elderly: 0, description: "" }),
      media: safeParse(row.media, []),
      documents: safeParse(row.documents, []),
      status: (row.status || "Pending Review") as any,
      timelineStages: safeParse(row.timelineStages, {}),
      assignedTo: String(row.assignedTo || ""),
      createdAt: String(row.createdAt || new Date().toISOString()),
      updatedAt: String(row.updatedAt || new Date().toISOString()),
    } as any;
  }

  protected mapEntityToRow(report: FieldReport): Record<string, any> {
    return {
      id: report.id,
      agentId: report.agentId,
      agentName: report.agentName,
      category: report.category,
      title: report.title,
      description: report.description,
      urgency: report.urgency,
      estimatedBudget: report.estimatedBudget,
      location: JSON.stringify(report.location || {}),
      beneficiaries: JSON.stringify(report.beneficiaries || {}),
      media: JSON.stringify(report.media || []),
      documents: JSON.stringify(report.documents || []),
      status: report.status,
      timelineStages: JSON.stringify((report as any).timelineStages || {}),
      assignedTo: (report as any).assignedTo || "",
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  public async getByAgentId(agentId: string): Promise<FieldReport[]> {
    const all = await this.getAll();
    return all.filter((r) => r.agentId === agentId);
  }
}

export const fieldReportRepository = new FieldReportRepository();
