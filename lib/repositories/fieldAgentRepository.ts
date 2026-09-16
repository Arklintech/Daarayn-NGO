import { BaseRepository } from "./baseRepository";

export interface FieldAgentEntity {
  id: string;
  firebaseUid?: string;
  name: string;
  email: string;
  phone?: string;
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  address?: string;
  role?: string;
  region?: string;
  status: "active" | "inactive" | "suspended" | string;
  assignedSupervisor?: string;
  avatarUrl?: string;
  joinDate?: string;
  requirePasswordChange?: boolean;
  permissions?: string[] | string;
  stats?: {
    reportsSubmitted?: number;
    tasksCompleted?: number;
    activeCases?: number;
    hoursLogged?: number;
  } | string;
}

const FIELD_AGENT_HEADERS = [
  "id",
  "firebaseUid",
  "name",
  "email",
  "phone",
  "country",
  "state",
  "district",
  "city",
  "address",
  "role",
  "region",
  "status",
  "assignedSupervisor",
  "avatarUrl",
  "joinDate",
  "requirePasswordChange",
  "permissions",
  "stats"
];

export class FieldAgentRepository extends BaseRepository<FieldAgentEntity> {
  constructor() {
    super("Field_Agents", FIELD_AGENT_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): FieldAgentEntity {
    let permissions = row.permissions;
    if (typeof permissions === "string" && permissions.startsWith("[")) {
      try {
        permissions = JSON.parse(permissions);
      } catch (e) {}
    }

    let stats = row.stats;
    if (typeof stats === "string" && stats.startsWith("{")) {
      try {
        stats = JSON.parse(stats);
      } catch (e) {}
    }

    return {
      id: String(row.id || ""),
      firebaseUid: row.firebaseUid ? String(row.firebaseUid) : undefined,
      name: String(row.name || ""),
      email: String(row.email || ""),
      phone: String(row.phone || ""),
      country: String(row.country || ""),
      state: String(row.state || ""),
      district: String(row.district || ""),
      city: String(row.city || ""),
      address: String(row.address || ""),
      role: String(row.role || "field_agent"),
      region: String(row.region || ""),
      status: String(row.status || "active"),
      assignedSupervisor: String(row.assignedSupervisor || ""),
      avatarUrl: String(row.avatarUrl || ""),
      joinDate: String(row.joinDate || ""),
      requirePasswordChange: row.requirePasswordChange === "true" || row.requirePasswordChange === true,
      permissions: permissions || [],
      stats: stats || {},
    };
  }

  protected mapEntityToRow(agent: FieldAgentEntity): Record<string, any> {
    return {
      id: agent.id,
      firebaseUid: agent.firebaseUid || "",
      name: agent.name || "",
      email: agent.email || "",
      phone: agent.phone || "",
      country: agent.country || "",
      state: agent.state || "",
      district: agent.district || "",
      city: agent.city || "",
      address: agent.address || "",
      role: agent.role || "field_agent",
      region: agent.region || "",
      status: agent.status || "active",
      assignedSupervisor: agent.assignedSupervisor || "",
      avatarUrl: agent.avatarUrl || "",
      joinDate: agent.joinDate || new Date().toISOString(),
      requirePasswordChange: Boolean(agent.requirePasswordChange),
      permissions: typeof agent.permissions === "object" ? JSON.stringify(agent.permissions) : (agent.permissions || "[]"),
      stats: typeof agent.stats === "object" ? JSON.stringify(agent.stats) : (agent.stats || "{}"),
    };
  }

  public async getByEmail(email: string): Promise<FieldAgentEntity | null> {
    const all = await this.getAll();
    const clean = email.toLowerCase().trim();
    return all.find(a => a.email?.toLowerCase().trim() === clean) || null;
  }

  public async getByFirebaseUid(uid: string): Promise<FieldAgentEntity | null> {
    const all = await this.getAll();
    return all.find(a => a.firebaseUid === uid) || null;
  }
}

export const fieldAgentRepository = new FieldAgentRepository();
