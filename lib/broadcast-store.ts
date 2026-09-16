export interface BroadcastRecord {
  id: string;
  createdBy: string;
  createdAt: string;
  communicationType: string;
  selectedCauseIds: string[];
  causeName: string;
  totalRecipients: number;
  status: "Queued" | "Processing" | "Completed" | "Failed";
  stats: {
    sent: number;
    failed: number;
    remaining: number;
  };
  startedAt: string | null;
  completedAt: string | null;
  processingDurationMs: number;
  failureReason?: string;
}

// Global in-memory cache for live worker tracking across serverless requests in same instance
const globalBroadcasts = new Map<string, BroadcastRecord>();

export const broadcastStore = {
  get(id: string): BroadcastRecord | undefined {
    return globalBroadcasts.get(id);
  },
  set(id: string, record: BroadcastRecord) {
    globalBroadcasts.set(id, record);
  },
  update(id: string, partial: Partial<BroadcastRecord>) {
    const existing = globalBroadcasts.get(id);
    if (existing) {
      const updated = { ...existing, ...partial };
      globalBroadcasts.set(id, updated);
      return updated;
    }
    return undefined;
  },
  getAll(): BroadcastRecord[] {
    return Array.from(globalBroadcasts.values());
  }
};
