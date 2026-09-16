import { BaseRepository } from "./baseRepository";

export interface CampaignEntity {
  id: string;
  title: string;
  goal: number;
  raised: number;
  startDate?: string;
  endDate?: string;
  status: string;
  createdAt: string;
}

const CAMPAIGN_HEADERS = [
  "id",
  "title",
  "goal",
  "raised",
  "startDate",
  "endDate",
  "status",
  "createdAt",
];

export class CampaignRepository extends BaseRepository<CampaignEntity> {
  constructor() {
    super("Campaigns", CAMPAIGN_HEADERS);
  }

  protected mapRowToEntity(row: Record<string, any>): CampaignEntity {
    return {
      id: String(row.id || ""),
      title: String(row.title || ""),
      goal: Number(row.goal || 0),
      raised: Number(row.raised || 0),
      startDate: String(row.startDate || ""),
      endDate: String(row.endDate || ""),
      status: String(row.status || "active"),
      createdAt: String(row.createdAt || new Date().toISOString()),
    };
  }

  protected mapEntityToRow(campaign: CampaignEntity): Record<string, any> {
    return {
      id: campaign.id,
      title: campaign.title,
      goal: campaign.goal,
      raised: campaign.raised,
      startDate: campaign.startDate || "",
      endDate: campaign.endDate || "",
      status: campaign.status,
      createdAt: campaign.createdAt,
    };
  }
}

export const campaignRepository = new CampaignRepository();
