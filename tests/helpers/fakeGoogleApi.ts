/**
 * In-memory fake of the Google Sheets v4 REST client (the `googleapis` object), so the REAL
 * lib/google/sheets.ts runs unchanged and every API request it makes can be counted.
 * Supports the calls the app uses: spreadsheets.get / batchUpdate, values.get / batchGet /
 * append / update / batchUpdate / clear. Quota and transient failures can be injected.
 */
export type ApiCounts = Record<string, number> & { reads: number; writes: number };

class ApiError extends Error {
  code: number;
  response: { status: number; headers: Record<string, string>; data: any };
  errors: { message: string; reason?: string }[];
  constructor(code: number, message: string, headers: Record<string, string> = {}, reason?: string) {
    super(message);
    this.code = code;
    this.response = { status: code, headers, data: { error: { code, message } } };
    this.errors = [{ message, reason }];
  }
}
export const quotaError = (retryAfter?: string) =>
  new ApiError(429, "Quota exceeded for quota metric 'Write requests' and limit 'Write requests per minute per user'", retryAfter ? { "retry-after": retryAfter } : {}, "rateLimitExceeded");
export const serverError = () => new ApiError(503, "The service is currently unavailable.");
export const permissionError = () => new ApiError(403, "The caller does not have permission", {}, "forbidden");
export const notFoundError = () => new ApiError(404, "Requested entity was not found.");
export const badRequestError = () => new ApiError(400, "Invalid values in request");

const colToIndex = (col: string) => col.split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;

/** "'Tab'!A5:F204" | "'Tab'!1:1" | "'Tab'!A:ZZ" | "'Tab'!A7" -> { tab, startRow, endRow|null, startCol } */
function parseRange(range: string) {
  const m = /^'?(.+?)'?!(.+)$/.exec(range);
  if (!m) throw badRequestError();
  const [, tab, a1] = m;
  const [from, to] = a1.split(":");
  const cell = (s: string) => {
    const mm = /^([A-Z]*)(\d*)$/.exec(s)!;
    return { col: mm[1] ? colToIndex(mm[1]) : 0, row: mm[2] ? parseInt(mm[2], 10) : null };
  };
  const f = cell(from);
  const t = to ? cell(to) : f;
  return { tab, startRow: f.row ?? 1, endRow: to ? t.row : f.row, startCol: f.col };
}

export class FakeGoogleApi {
  tabs = new Map<string, string[][]>(); // row 0 = header row (sheet row 1)
  counts: ApiCounts = this.blankCounts();
  /** Errors thrown (in order) by the next matching API calls: { when: "write"|"read"|"any", error } */
  failures: { when: "write" | "read" | "any"; error: any; method?: string; /** only fail calls whose request args match (e.g. a given tab) */ match?: (args: any) => boolean }[] = [];
  /** Optional per-call jitter so concurrent requests interleave. */
  jitter = false;

  private blankCounts(): ApiCounts {
    return { reads: 0, writes: 0 } as ApiCounts;
  }
  resetCounts() {
    this.counts = this.blankCounts();
  }
  reset() {
    this.tabs.clear();
    this.failures = [];
    this.resetCounts();
  }

  private async hit(name: string, kind: "read" | "write", args?: any) {
    this.counts[name] = (this.counts[name] || 0) + 1;
    if (kind === "read") this.counts.reads++;
    else this.counts.writes++;
    if (this.jitter) await new Promise((r) => setTimeout(r, Math.random() * 3));
    const i = this.failures.findIndex((f) => (f.when === "any" || f.when === kind) && (!f.method || f.method === name) && (!f.match || f.match(args)));
    if (i >= 0) throw this.failures.splice(i, 1)[0].error;
  }
  private tab(name: string) {
    const t = this.tabs.get(name);
    if (!t) throw notFoundError();
    return t;
  }
  private slice(range: string) {
    const r = parseRange(range);
    const rows = this.tab(r.tab);
    const end = r.endRow ?? rows.length;
    const out: string[][] = [];
    for (let i = r.startRow - 1; i < Math.min(end, rows.length); i++) {
      const row = (rows[i] || []).slice(r.startCol);
      out.push(row);
    }
    // Sheets omits trailing empty rows
    while (out.length && out[out.length - 1].every((c) => c === "" || c === undefined)) out.pop();
    return out;
  }
  private write(range: string, values: any[][]) {
    const r = parseRange(range);
    const rows = this.tab(r.tab);
    values.forEach((v, k) => {
      const idx = r.startRow - 1 + k;
      while (rows.length <= idx) rows.push([]);
      const row = rows[idx];
      v.forEach((cell, c) => (row[r.startCol + c] = String(cell ?? "")));
    });
  }

  /** The object the app receives from getSheetsClient(). */
  client() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the returned client object needs the fake instance
    const self = this;
    return {
      spreadsheets: {
        async get() {
          await self.hit("spreadsheets.get", "read");
          return { data: { sheets: [...self.tabs.keys()].map((title) => ({ properties: { title } })) } };
        },
        async batchUpdate({ requestBody }: any) {
          await self.hit("spreadsheets.batchUpdate", "write");
          for (const req of requestBody.requests || []) {
            if (req.addSheet) {
              const title = req.addSheet.properties.title;
              if (self.tabs.has(title)) throw new ApiError(400, `Invalid requests[0].addSheet: A sheet with the name "${title}" already exists. Please enter another name.`);
              self.tabs.set(title, []);
            }
          }
          return { data: {} };
        },
        values: {
          async get({ range }: any) {
            await self.hit("values.get", "read", { range });
            return { data: { values: self.slice(range) } };
          },
          async batchGet({ ranges }: any) {
            await self.hit("values.batchGet", "read");
            return { data: { valueRanges: ranges.map((r: string) => ({ values: self.slice(r) })) } };
          },
          async append({ range, requestBody }: any) {
            await self.hit("values.append", "write", { range });
            const { tab } = parseRange(range);
            const rows = self.tab(tab);
            const first = rows.length + 1;
            requestBody.values.forEach((v: any[]) => rows.push(v.map((c) => String(c ?? ""))));
            const last = rows.length;
            return { data: { updates: { updatedRange: `'${tab}'!A${first}:Z${last}` } } };
          },
          async update({ range, requestBody }: any) {
            await self.hit("values.update", "write", { range });
            self.write(range, requestBody.values);
            return { data: {} };
          },
          async batchUpdate({ requestBody }: any) {
            await self.hit("values.batchUpdate", "write");
            for (const d of requestBody.data) self.write(d.range, d.values);
            return { data: {} };
          },
          async clear({ range }: any) {
            await self.hit("values.clear", "write");
            const r = parseRange(range);
            const rows = self.tab(r.tab);
            const end = r.endRow ?? rows.length;
            for (let i = r.startRow - 1; i < Math.min(end, rows.length); i++) rows[i] = r.startCol === 0 && range.includes("ZZ") ? [] : (rows[i] || []).map(() => "");
            return { data: {} };
          },
        },
      },
    };
  }

  /** Test helpers (not API calls). */
  records(tab: string) {
    const rows = this.tabs.get(tab) || [];
    const h = rows[0] || [];
    return rows.slice(1).filter((r) => r[0]).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
  }
}

export const fakeApi = new FakeGoogleApi();
