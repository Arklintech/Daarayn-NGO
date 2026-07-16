/**
 * lib/ai/agents/knowledgeAgent.ts
 *
 * Knowledge Agent for Daarayn AI-TOS.
 * Queries policies and approved documentation.
 */

import { retrieveVerifiedKnowledge } from "../knowledgeEngine";

export class KnowledgeAgent {
  public async queryPolicies(queryText: string, collections: string[]) {
    return retrieveVerifiedKnowledge(queryText, collections);
  }
}
