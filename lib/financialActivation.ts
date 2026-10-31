/**
 * Financial activation switch. Deploying the website is separate from activating financial operations: in a production environment donations,
 * donation verification and allocations stay paused until the owner has approved the production configuration and completed data onboarding and sets
 * FINANCIAL_ACTIVATION_APPROVED=true (allocations additionally need ALLOCATION_SERIALIZATION_VERIFIED=true). Other environments are never paused.
 */
export function financialOperationsPaused(env: Record<string, string | undefined> = process.env): boolean {
  const production = (env.GOOGLE_TARGET_ENV || "").trim() === "production" || (env.VERCEL_ENV || "").trim() === "production";
  return production && (env.FINANCIAL_ACTIVATION_APPROVED || "").trim() !== "true";
}

export const FINANCIAL_PAUSED_MESSAGE = "Contributions are not being accepted through this website yet. Please check back soon.";
