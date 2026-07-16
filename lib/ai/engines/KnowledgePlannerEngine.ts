export interface QueryParameters { time_window?: string; result_shape?: string; query?: string; }
export class KnowledgePlannerEngine {
  static planKnowledge(purpose: string, msg: string, ice: any): any {
    return { firestore_live_data: { needed: true, query: "global" } };
  }
  static extractQueryParameters(msg: string, type: string): any {
    return { query: msg };
  }
}
