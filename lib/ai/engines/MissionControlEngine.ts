/**
 * lib/ai/engines/MissionControlEngine.ts
 *
 * Mission Control Engine (MCE) for Phase 3.
 * Orchestrates approved execution steps, calculates deterministic milestone timelines,
 * and validates admin sign-off credentials.
 */

import { BusinessRulesEngine } from "./BusinessRulesEngine";

export interface TimelineMilestone {
  stepIndex: number;
  label: string;
  actionKey: string;
  projectedDurationMs: number;
  expectedCompletionTime: string;
}

export interface WorkflowTimeline {
  workflowId: string;
  totalProjectedDurationMs: number;
  milestones: TimelineMilestone[];
}

export class MissionControlEngine {
  // Typical execution cost benchmarks in ms
  private static DURATION_BENCHMARKS: Record<string, number> = {
    fetch_donation: 450,
    validate_splits: 150,
    write_allocations: 800,
    draft_receipt_email: 600,
    dispatch_email: 900,
    sync_analytics: 700,
    fetch_milestones: 400,
    compile_update_log: 500,
    fetch_supporting_donors: 600,
    publish_portal: 850,
    send_newsletter: 1200,
    audit_donor_totals: 500,
    compile_certificates: 400,
    write_certificates: 750,
    send_certificates_email: 950,
    fetch_pending_drafts: 350,
    validate_communications: 300,
    dispatch_smtp: 1100,
    write_comms_logs: 650,
    fetch_ledger_logs: 450,
    audit_receipts: 550,
    calculate_health_score: 400,
    log_compliance_flags: 300,
  };

  /**
   * Constructs a deterministic timeline for a workflow's steps.
   */
  static registerTimeline(workflowId: string, steps: any[]): WorkflowTimeline {
    const milestones: TimelineMilestone[] = [];
    let totalProjectedDurationMs = 0;
    let accumulatedTimeMs = 0;

    steps.forEach((step, idx) => {
      const benchmark = this.DURATION_BENCHMARKS[step.actionKey] || 500;
      totalProjectedDurationMs += benchmark;
      accumulatedTimeMs += benchmark;

      const completionDate = new Date(Date.now() + accumulatedTimeMs);

      milestones.push({
        stepIndex: step.stepIndex || idx + 1,
        label: step.label,
        actionKey: step.actionKey,
        projectedDurationMs: benchmark,
        expectedCompletionTime: completionDate.toISOString(),
      });
    });

    return {
      workflowId,
      totalProjectedDurationMs,
      milestones,
    };
  }

  /**
   * Strict signature validator checking role constraints before writing to database.
   */
  static validateSignOff(role: string, operation: string): { authorized: boolean; error?: string } {
    // Write access authorization through BRE rules
    const hasWritePermission = BusinessRulesEngine.verifyAccessRules(role, operation, "write");

    if (!hasWritePermission) {
      return {
        authorized: false,
        error: `Sign-off Denied: Role "${role}" is not authorized to write changes to "${operation}".`,
      };
    }

    return { authorized: true };
  }
}
