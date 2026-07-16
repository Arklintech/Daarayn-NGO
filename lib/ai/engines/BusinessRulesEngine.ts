/**
 * lib/ai/engines/BusinessRulesEngine.ts
 *
 * Business Rules Engine (BRE) for Phase 3.
 * Centralizes all policy validations, RBAC checks, thresholds, compliance constraints, and frequency rules.
 */

import { ROLE_PERMISSIONS, UserRole } from "../permissions";
import { normalizeUserRole } from "../roleNormalizer";

export interface RulesReport {
  passed: boolean;
  errors: string[];
}

export interface RulesConfig {
  allocationReviewThreshold: number;
  caretakerUpdateFrequencyDays: number;
  blockedSpeculativeWords: string[];
}

export class BusinessRulesEngine {
  private static config: RulesConfig = {
    allocationReviewThreshold: 100000,
    caretakerUpdateFrequencyDays: 30,
    blockedSpeculativeWords: ["approximately", "estimated", "roughly", "probably", "we hope to"]
  };

  static updateConfig(newConfig: Partial<RulesConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  static getConfig(): RulesConfig {
    return this.config;
  }

  /**
   * Evaluates donation split rules and triggers alerts for large values.
   */
  static evaluateDonationLimits(amount: number, role: string): RulesReport {
    const errors: string[] = [];
    const numAmt = Number(amount) || 0;

    if (numAmt <= 0) {
      errors.push("BRE: Allocation amount must be greater than ₹0.");
    }

    // Configurable threshold check
    if (numAmt >= this.config.allocationReviewThreshold && normalizeUserRole(role) !== "super_admin") {
      errors.push(`BRE: Allocation limit warning — Transactions of ₹${numAmt.toLocaleString()} or more require Super Admin authorization.`);
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * Strict Role-Based Access Control verification.
   */
  static verifyAccessRules(role: string, department: string, action: "read" | "write"): boolean {
    const normalizedRole = normalizeUserRole(role);
    const permissions = ROLE_PERMISSIONS[normalizedRole];

    if (!permissions) {
      return false;
    }

    if (action === "write") {
      // Only super_admin or editor can propose write operations (and only super_admin can run final execution)
      return normalizedRole === "super_admin" || normalizedRole === "editor";
    }

    // Read permissions checks mapped by department context
    if (department === "donorIntelligence" || department === "donors" || department === "donor") {
      return permissions.canReadDonors;
    }
    if (department === "donationSearch" || department === "donations" || department === "allocations" || department === "donation") {
      return permissions.canReadLedger;
    }
    if (department === "global" || department === "knowledge") {
      return true;
    }
    if (department === "administration" || department === "compliance") {
      return normalizedRole === "super_admin" || normalizedRole === "editor";
    }
    if (department === "executive") {
      return normalizedRole === "super_admin" || normalizedRole === "editor" || normalizedRole === "finance" || normalizedRole === "compliance";
    }

    // General programs, analytics, and knowledge info are allowed for reading by all roles
    return true;
  }

  /**
   * Checks compliance of caretaker update logs frequency.
   */
  static verifyCaretakerUpdateFrequency(lastUpdateDateStr: string): RulesReport {
    const errors: string[] = [];
    if (!lastUpdateDateStr) {
      return { passed: true, errors };
    }

    const lastUpdate = new Date(lastUpdateDateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Organization policy: caretakers must log updates within configurable days limit
    if (diffDays > this.config.caretakerUpdateFrequencyDays) {
      errors.push(`BRE Compliance Notice: Program caretaker updates are overdue by ${diffDays - this.config.caretakerUpdateFrequencyDays} days (last log: ${lastUpdateDateStr}).`);
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * Enforces compliance checks for drafts (like not disclosing emails/IDs in text bodies).
   */
  static verifyDraftSecurity(bodyText: string, donorEmail?: string, donorId?: string): RulesReport {
    const errors: string[] = [];
    if (!bodyText || typeof bodyText !== "string") return { passed: true, errors };

    const lowerBody = bodyText.toLowerCase();

    if (donorEmail && lowerBody.includes(donorEmail.toLowerCase())) {
      errors.push("BRE Compliance Block: Donor email address is exposed in draft message text.");
    }

    if (donorId && lowerBody.includes(donorId.toLowerCase())) {
      errors.push("BRE Compliance Block: Internal donor ID is exposed in draft message text.");
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }
}
