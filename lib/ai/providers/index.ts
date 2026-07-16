/**
 * lib/ai/providers/index.ts
 *
 * Public barrel export for the EIPM layer.
 * Import from here — never import individual modules directly outside this folder.
 */

export { EnterpriseProviderManager } from "./EnterpriseProviderManager";
export type {
  ProviderRequest,
  NormalizedResponse,
  ProviderSlotHealth,
  ProviderState,
  CompletionMode,
  IProvider,
  EIPMEvent,
  EIPMEventType,
} from "./ProviderTypes";
