/**
 * Keyboard logic of the admin dropdown (components/admin/AdminSelect.tsx), kept pure so it can be tested without a DOM.
 * Lists can be long (every verified donation), so arrows, Home/End, paging and type-to-jump all work.
 */
const PAGE = 8;

/** New active index for a navigation key. Stops at the ends; from "nothing active" (-1) the first option is reached. Unrelated keys change nothing. */
export function moveIndex(current: number, key: string, length: number): number {
  if (length <= 0) return -1;
  const last = length - 1;
  const clamp = (n: number) => Math.max(0, Math.min(last, n));
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : clamp(current + 1);
    case "ArrowUp":
      return current < 0 ? 0 : clamp(current - 1);
    case "Home":
      return 0;
    case "End":
      return last;
    case "PageDown":
      return clamp((current < 0 ? 0 : current) + PAGE);
    case "PageUp":
      return clamp((current < 0 ? 0 : current) - PAGE);
    default:
      return current;
  }
}

/**
 * Index of the next option whose label starts with `query` (case-insensitive), or -1. One repeated letter cycles through its matches (like a native select); a longer
 * query matches from the current option so refining the query does not jump backwards.
 */
export function typeahead(labels: string[], query: string, from: number): number {
  const q = query.trim().toLowerCase();
  if (!q || labels.length === 0) return -1;
  const repeated = q.length > 1 && q.split("").every((c) => c === q[0]);
  const needle = repeated ? q[0] : q;
  const cycle = needle.length === 1 && (q.length === 1 || repeated);
  const begin = cycle ? from + 1 : Math.max(0, from);
  for (let n = 0; n < labels.length; n++) {
    const i = (begin + n) % labels.length;
    if (labels[i].toLowerCase().startsWith(needle)) return i;
  }
  return -1;
}

export interface TypeaheadState {
  buffer: string;
  at: number;
}

/** Adds a printable key to the typed query; a pause longer than `windowMs` starts a new query. Non-printing keys and the space bar (which selects) are ignored. */
export function appendTypeahead(state: TypeaheadState, key: string, now: number, windowMs = 700): TypeaheadState {
  if (key.length !== 1 || key === " ") return state;
  const fresh = now - state.at > windowMs;
  return { buffer: (fresh ? "" : state.buffer) + key, at: now };
}
