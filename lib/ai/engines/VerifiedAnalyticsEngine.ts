/**
 * lib/ai/engines/VerifiedAnalyticsEngine.ts
 *
 * Verified Analytics Engine (VAE) for Phase 3.
 * Authoritative, deterministic backend calculations for financial splits, aggregated values, and progress metrics.
 */

export interface AggregatedDonations {
  totalAmount: number;
  currencySplit: Record<string, number>;
  transactionCount: number;
  maxDonation: number;
}

export interface DonationSplit {
  directAid: number;
  opsCost: number;
}

export class VerifiedAnalyticsEngine {
  /**
   * Aggregates a list of donation raw records.
   */
  static calculateAggregatedDonations(donations: any[]): AggregatedDonations {
    const currencySplit: Record<string, number> = {};
    let totalAmount = 0;
    let maxDonation = 0;

    donations.forEach((d) => {
      const amt = Number(d.amount) || 0;
      const currency = String(d.currency || "INR").toUpperCase();
      totalAmount += amt;
      maxDonation = Math.max(maxDonation, amt);
      currencySplit[currency] = (currencySplit[currency] || 0) + amt;
    });

    return {
      totalAmount,
      currencySplit,
      transactionCount: donations.length,
      maxDonation,
    };
  }

  /**
   * Authoritatively splits a donation into 90% direct aid and 10% operations splits.
   */
  static calculateAllocationSplits(amount: number): DonationSplit {
    const numAmt = Number(amount) || 0;
    const directAid = Math.floor(numAmt * 0.9);
    const opsCost = Math.floor(numAmt * 0.1);
    return {
      directAid,
      opsCost,
    };
  }

  /**
   * Calculates program funding progress percentage and remaining gap.
   */
  static calculateProgramProgress(
    amountCollected: number,
    amountRequired: number
  ): { progress: number; remainingGap: number } {
    const req = Number(amountRequired) || 0;
    const col = Number(amountCollected) || 0;
    const progress = req > 0 ? Math.min(100, Math.round((col / req) * 100)) : 0;
    const remainingGap = Math.max(0, req - col);

    return {
      progress,
      remainingGap,
    };
  }

  /**
   * Authoritatively computes comprehensive donor and donation metrics.
   */
  static calculateExtendedMetrics(donations: any[]): {
    totalDonations: number;
    averageDonation: number;
    largestDonation: number;
    smallestDonation: number;
    medianDonation: number;
    uniqueDonorsCount: number;
    repeatDonorsCount: number;
    topDonorId: string;
    topDonorName: string;
    topDonorTotal: number;
  } {
    const count = donations.length;
    if (count === 0) {
      return {
        totalDonations: 0,
        averageDonation: 0,
        largestDonation: 0,
        smallestDonation: 0,
        medianDonation: 0,
        uniqueDonorsCount: 0,
        repeatDonorsCount: 0,
        topDonorId: "",
        topDonorName: "",
        topDonorTotal: 0,
      };
    }

    const amounts = donations.map((d) => Number(d.amount) || 0).sort((a, b) => a - b);
    const totalDonations = amounts.reduce((acc, val) => acc + val, 0);
    const averageDonation = totalDonations / count;
    const largestDonation = amounts[count - 1];
    const smallestDonation = amounts[0];

    // Median calculation
    let medianDonation = 0;
    const mid = Math.floor(count / 2);
    if (count % 2 !== 0) {
      medianDonation = amounts[mid];
    } else {
      medianDonation = (amounts[mid - 1] + amounts[mid]) / 2;
    }

    // Unique vs Repeat donors & Top donor tracking
    const donorTotals: Record<string, { name: string; total: number; count: number }> = {};
    donations.forEach((d) => {
      const dId = d.donorId || d.donor || "anonymous";
      const name = d.donorName || d.donor || "Anonymous";
      const amt = Number(d.amount) || 0;

      if (!donorTotals[dId]) {
        donorTotals[dId] = { name, total: 0, count: 0 };
      }
      donorTotals[dId].total += amt;
      donorTotals[dId].count += 1;
    });

    let uniqueDonorsCount = 0;
    let repeatDonorsCount = 0;
    let topDonorId = "";
    let topDonorName = "";
    let topDonorTotal = 0;

    Object.entries(donorTotals).forEach(([id, info]) => {
      uniqueDonorsCount++;
      if (info.count > 1) {
        repeatDonorsCount++;
      }
      if (info.total > topDonorTotal) {
        topDonorTotal = info.total;
        topDonorId = id;
        topDonorName = info.name;
      }
    });

    return {
      totalDonations,
      averageDonation,
      largestDonation,
      smallestDonation,
      medianDonation,
      uniqueDonorsCount,
      repeatDonorsCount,
      topDonorId,
      topDonorName,
      topDonorTotal,
    };
  }
}
