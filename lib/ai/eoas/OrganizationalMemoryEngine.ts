/**
 * lib/ai/eoas/OrganizationalMemoryEngine.ts
 * 
 * Provides longitudinal context (Yesterday, This Week, This Month, Seasonality)
 * Interfaces with the ExecutiveExperienceLibrary to inject approved past lessons.
 */

import { ExecutiveExperienceLibrary } from "../mibf/ExecutiveExperienceLibrary";

export interface TimeframeContext {
  yesterdayHighlights: string[];
  thisWeekTrend: string;
  thisMonthTrend: string;
  seasonality: string;
}

export interface OrganizationalMemory {
  timeframe: TimeframeContext;
  experienceContext: string;
}

export class OrganizationalMemoryEngine {
  
  static getMemoryContext(): OrganizationalMemory {
    
    // In production, this would query Firestore for historical aggregates.
    // For now, we mock deterministic historical trends to demonstrate ETOM capabilities.
    const month = new Date().getMonth();
    let seasonality = "Standard operational period.";
    
    // Example: Ramadan Seasonality (Assuming Month 2 is Ramadan for testing purposes, or hardcoded for demo)
    // We'll just define a generic deterministic seasonality based on the current month.
    if (month >= 2 && month <= 3) {
      seasonality = "Approaching peak Zakat collection season (Ramadan). High donor engagement expected.";
    } else if (month === 11) {
      seasonality = "Year-end tax deduction giving period. High activity expected.";
    } else if (month >= 5 && month <= 7) {
      seasonality = "Summer slump. Donation volume historically decreases by 15% during this period.";
    }

    const timeframe: TimeframeContext = {
      yesterdayHighlights: [
        "Cleared 45 pending vendor invoices.",
        "Launched the new Water Well campaign in Region B."
      ],
      thisWeekTrend: "Slight uptick in recurring donations (+2%) compared to last week.",
      thisMonthTrend: "Tracking 5% below monthly funding targets for emergency relief projects.",
      seasonality
    };

    // Load dynamic experience from MIBF
    const experienceContext = ExecutiveExperienceLibrary.getExperienceContext();

    return {
      timeframe,
      experienceContext
    };
  }
}
