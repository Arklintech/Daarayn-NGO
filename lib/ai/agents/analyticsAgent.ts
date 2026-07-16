/**
 * lib/ai/agents/analyticsAgent.ts
 *
 * Analytics Agent for Daarayn AI-TOS.
 * Performs statistical calculations and maps ledger growth ratios.
 */

export class AnalyticsAgent {
  public calculateGrowth(currentValue: number, previousValue: number): {
    percentage: number;
    description: string;
  } {
    if (previousValue === 0) return { percentage: 100, description: "+100% (baseline)" };
    const diff = currentValue - previousValue;
    const percentage = Math.round((diff / previousValue) * 100);
    return {
      percentage,
      description: `${percentage >= 0 ? "+" : ""}${percentage}% change relative to previous timeframe.`,
    };
  }

  public compileProgramRatios(programs: any[]): Record<string, number> {
    const totalRaised = programs.reduce((sum, p) => sum + (p.amountCollected || 0), 0);
    if (totalRaised === 0) return {};
    
    const ratios: Record<string, number> = {};
    programs.forEach(p => {
      ratios[p.title || p.id] = Math.round(((p.amountCollected || 0) / totalRaised) * 100);
    });
    return ratios;
  }
}
