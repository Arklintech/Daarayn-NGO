import { BaseRepository } from "./baseRepository";

export interface SystemNotification {
  id: string; // NOTIF-YYYY-XXXXXX
  recipientType: "Admin" | "FieldAgent" | "Donor";
  recipientId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  relatedEntityId?: string;
  createdAt: string;
}

const NOTIFICATION_HEADERS = [
  "id",
  "recipientType",
  "recipientId",
  "type",
  "title",
  "message",
  "read",
  "relatedEntityId",
  "createdAt",
];

export class NotificationRepository extends BaseRepository<SystemNotification> {
  constructor() {
    super("Notifications", NOTIFICATION_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): SystemNotification {
    return {
      id: String(row.id || row.ID || ""),
      recipientType: (row.recipientType || "Admin") as any,
      recipientId: String(row.recipientId || "all"),
      type: String(row.type || "info"),
      title: String(row.title || ""),
      message: String(row.message || ""),
      read: String(row.read) === "true" || row.read === true,
      relatedEntityId: String(row.relatedEntityId || ""),
      createdAt: String(row.createdAt || new Date().toISOString()),
    };
  }

  protected mapEntityToRow(notif: SystemNotification): Record<string, any> {
    return {
      id: notif.id,
      recipientType: notif.recipientType,
      recipientId: notif.recipientId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      read: notif.read,
      relatedEntityId: notif.relatedEntityId || "",
      createdAt: notif.createdAt,
    };
  }

  public async getForRecipient(recipientType: string, recipientId: string): Promise<SystemNotification[]> {
    const all = await this.getAll();
    return all.filter(
      (n) => n.recipientType === recipientType && (n.recipientId === "all" || n.recipientId === recipientId)
    );
  }
}

export const notificationRepository = new NotificationRepository();
