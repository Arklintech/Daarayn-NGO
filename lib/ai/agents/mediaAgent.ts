/**
 * lib/ai/agents/mediaAgent.ts
 *
 * Media Agent for Daarayn AI-TOS.
 * Focuses on auditing photo, video, and invoices count records.
 */

export class MediaAgent {
  public checkAuditMediaCount(media: string[]): {
    count: number;
    hasMedia: boolean;
    description: string;
  } {
    const list = media || [];
    return {
      count: list.length,
      hasMedia: list.length > 0,
      description: list.length > 0 
        ? `${list.length} verified image/video assets uploaded by inspectors.` 
        : "No inspector media attachments uploaded yet.",
    };
  }

  public checkReceiptsTotal(receipts: Array<{ title: string; value: number }>): number {
    return (receipts || []).reduce((sum, r) => sum + (r.value || 0), 0);
  }
}
