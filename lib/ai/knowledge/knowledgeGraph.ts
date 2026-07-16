/**
 * lib/ai/knowledge/knowledgeGraph.ts
 *
 * Future-ready entity relationship graph stub.
 * Prepared to track cross-collection parameters (donors -> donations -> program allocations) in Phase 3/4.
 */

export interface EntityNode {
  id: string;
  label: string;
  type: "donor" | "donation" | "program" | "allocation";
}

export interface EntityEdge {
  source: string;
  target: string;
  type: string; // e.g. "donated", "allocated_to", "supports"
}

export class KnowledgeGraph {
  private nodes: Map<string, EntityNode> = new Map();
  private edges: EntityEdge[] = [];

  public addNode(node: EntityNode) {
    this.nodes.set(node.id, node);
  }

  public addEdge(edge: EntityEdge) {
    this.edges.push(edge);
  }

  public getNodes(): EntityNode[] {
    return Array.from(this.nodes.values());
  }

  public getEdges(): EntityEdge[] {
    return this.edges;
  }

  /**
   * Stubs trace relations logic
   */
  public compileRelationsFromFacts(facts: any[]): void {
    facts.forEach(fact => {
      if (fact.source === "donations") {
        const d = fact.data;
        this.addNode({ id: d.id, label: `Donation: ${d.amount}`, type: "donation" });
        if (d.donorId) {
          this.addNode({ id: d.donorId, label: d.donorName || "Donor", type: "donor" });
          this.addEdge({ source: d.donorId, target: d.id, type: "donated" });
        }
      }
    });
  }
}
