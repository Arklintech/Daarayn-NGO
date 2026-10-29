import { programContentRepository } from "./programContent";
import { causeRepository } from "../repositories/causeRepository";
import { sheetsService } from "../google/sheets";
import { masjidHoldState } from "./programDomains";
import { serverNow } from "./clock";

/** Ids of Masjid projects currently on hold. Throws when Program_Content cannot be read: donation checks then fail closed. */
export async function getHeldProgramIds(now: Date = serverNow(), fresh = false): Promise<Set<string>> {
  const rows = await programContentRepository.getAll(fresh);
  return new Set(rows.filter((c) => masjidHoldState(c, now).held).map((c) => c.id));
}

/**
 * Current eligibility inputs for a donation to specific causes, read FRESH in ONE batched Sheets request (Causes and Program_Content together)
 * instead of two. Nothing is taken from a cache: both repositories are refreshed from the rows just read.
 */
export async function readEligibilityFresh(now: Date = serverNow()): Promise<{ catalog: Awaited<ReturnType<typeof causeRepository.getAll>>; held: Set<string> }> {
  await Promise.all([causeRepository.init(), programContentRepository.init()]);
  const rows = await sheetsService.batchGetRows([causeRepository.tabName, programContentRepository.tabName]);
  const catalog = causeRepository.hydrate(rows[causeRepository.tabName] || []);
  const contents = programContentRepository.hydrate(rows[programContentRepository.tabName] || []);
  return { catalog, held: new Set(contents.filter((c) => masjidHoldState(c, now).held).map((c) => c.id)) };
}
