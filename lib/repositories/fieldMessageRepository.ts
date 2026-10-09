import { BaseRepository } from "./baseRepository";

export interface FieldChatMessageEntity {
  id: string; // MSG-XXXX
  conversationId: string;
  reportId?: string;
  agentId?: string;
  senderId: string;
  senderRole: "Admin" | "Agent" | "Supervisor";
  senderName: string;
  text: string;
  timestamp: string;
  read: boolean;
  attachmentDriveFileId?: string;
}

const FIELD_MESSAGE_HEADERS = [
  "id",
  "conversationId",
  "reportId",
  "agentId",
  "senderId",
  "senderRole",
  "senderName",
  "text",
  "timestamp",
  "read",
  "attachmentDriveFileId",
];

export class FieldMessageRepository extends BaseRepository<FieldChatMessageEntity> {
  constructor() {
    super("Field_Messages", FIELD_MESSAGE_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): FieldChatMessageEntity {
    return {
      id: String(row.id || row.ID || ""),
      conversationId: String(row.conversationId || ""),
      reportId: row.reportId ? String(row.reportId) : undefined,
      agentId: row.agentId ? String(row.agentId) : undefined,
      senderId: String(row.senderId || ""),
      senderRole: (row.senderRole || "Agent") as any,
      senderName: String(row.senderName || "Unknown"),
      text: String(row.text || ""),
      timestamp: String(row.timestamp || new Date().toISOString()),
      read: String(row.read).toLowerCase() === "true" || row.read === true || row.read === 1 || String(row.read) === "1",
      attachmentDriveFileId: row.attachmentDriveFileId ? String(row.attachmentDriveFileId) : undefined,
    };
  }

  protected mapEntityToRow(entity: FieldChatMessageEntity): Record<string, any> {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
      reportId: entity.reportId || "",
      agentId: entity.agentId || "",
      senderId: entity.senderId,
      senderRole: entity.senderRole,
      senderName: entity.senderName,
      text: entity.text,
      timestamp: entity.timestamp,
      read: Boolean(entity.read),
      attachmentDriveFileId: entity.attachmentDriveFileId || "",
    };
  }

  public async getByConversationId(conversationId: string): Promise<FieldChatMessageEntity[]> {
    const all = await this.getAll();
    return all.filter((m) => m.conversationId === conversationId);
  }
}

export const fieldMessageRepository = new FieldMessageRepository();
