import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, authState, driveMock } from "./helpers/mocks";

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const rows = (tab: string) => fakeSheets.records(tab);
const png = (name: string, bytes = 100, type = "image/png") => new File([new Uint8Array(bytes).fill(7)], name, { type });

let driveSeq = 0;
beforeEach(async () => {
  await resetWorld();
  revalidateTag.mockReset();
  fakeSheets.seed("Causes", CAUSE_HEADERS, []);
  driveSeq = 0;
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `DRIVEFILE_${String(++driveSeq).padStart(4, "0")}`, storage_backend: "google_drive" }));
  driveMock.deleteFile.mockImplementation(async () => true);
  const { programImageRepository } = await import("@/lib/catalog/programImages");
  programImageRepository.invalidateCache();
  (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
  (await import("@/lib/catalog/public")).invalidatePublicCatalog();
});

const saveProgram = async (id: string, status = "Active", title = `Program ${id}`) => {
  const { POST } = await import("@/app/api/admin/programs/route");
  const res = await POST(new NextRequest("http://t/api/admin/programs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, kind: "project", title, targetAmount: 1000, status, content: { template: "relief" } }) }));
  expect(res.status).toBe(200);
};
const upload = async (programId: string, files: File[], extra: Record<string, string> = {}, meta?: any[]) => {
  const { POST } = await import("@/app/api/admin/programs/images/route");
  const fd = new FormData();
  fd.append("programId", programId);
  files.forEach((f) => fd.append("files", f));
  if (meta) fd.append("meta", JSON.stringify(meta));
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  return POST(new NextRequest("http://t/api/admin/programs/images", { method: "POST", body: fd }));
};
const patch = async (body: any) => (await import("@/app/api/admin/programs/images/route")).PATCH(new NextRequest("http://t/api/admin/programs/images", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const del = async (body: any) => (await import("@/app/api/admin/programs/images/route")).DELETE(new NextRequest("http://t/api/admin/programs/images", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const publicProgram = async (id: string) => {
  authState.role = "none";
  const res = await (await import("@/app/api/programs/route")).GET(new NextRequest(`http://t/api/programs?id=${id}`));
  authState.role = "admin";
  return ((await res.json()) as any[])[0];
};
const active = (programId: string) => rows("Program_Images").filter((r) => r.programId === programId && !r.removedAt).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));

describe("multi-image gallery: upload and persistence", () => {
  it("uploads several images at once: files in Drive, one metadata row each (file id, program id, caption, alt, order), first is the cover; no binaries in Sheets", async () => {
    await saveProgram("PROGRAM-G1");
    const res = await upload("PROGRAM-G1", [png("a.png"), png("b.png"), png("c.png"), png("d.png")], {}, [{ caption: "One", alt: "First" }, { caption: "Two" }, {}, {}]);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, stored: 4, failed: 0 });
    const r = active("PROGRAM-G1");
    expect(r).toHaveLength(4);
    expect(r.map((x) => x.fileId)).toEqual(["DRIVEFILE_0001", "DRIVEFILE_0002", "DRIVEFILE_0003", "DRIVEFILE_0004"]);
    expect(r.map((x) => x.sortOrder)).toEqual(["0", "1", "2", "3"]);
    expect(r.map((x) => x.isCover)).toEqual(["true", "false", "false", "false"]);
    expect(r[0]).toMatchObject({ caption: "One", alt: "First", programId: "PROGRAM-G1" });
    expect(JSON.stringify(r)).not.toMatch(/base64|\u0007\u0007/);
    expect(driveMock.uploadFile).toHaveBeenCalledTimes(4);
  });

  it("images can be added after the program exists and continue the order; other programs are untouched", async () => {
    await saveProgram("PROGRAM-G1");
    await saveProgram("PROGRAM-G2");
    await upload("PROGRAM-G2", [png("other.png")]);
    await upload("PROGRAM-G1", [png("a.png")]);
    await upload("PROGRAM-G1", [png("b.png"), png("c.png")]);
    expect(active("PROGRAM-G1").map((x) => x.sortOrder)).toEqual(["0", "1", "2"]);
    expect(active("PROGRAM-G2")).toHaveLength(1);
    const p1 = await publicProgram("PROGRAM-G1");
    const p2 = await publicProgram("PROGRAM-G2");
    expect(p1.images).toHaveLength(3);
    expect(p2.images).toHaveLength(1);
    expect(p1.images.map((i: any) => i.url)).not.toContain(p2.images[0].url); // never under another program
  });

  it("invalid, oversized and empty files are refused per file with a reason; valid ones in the same request are stored", async () => {
    await saveProgram("PROGRAM-G1");
    const res = await upload("PROGRAM-G1", [png("ok.png"), png("doc.pdf", 100, "application/pdf"), png("huge.png", 6 * 1024 * 1024), png("empty.png", 0), png("fine.webp", 50, "image/webp")]);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: false, stored: 2, failed: 3 });
    expect(body.results.filter((r: any) => !r.ok).map((r: any) => r.error)).toEqual([
      expect.stringMatching(/not a supported image/), expect.stringMatching(/larger than 5 MB/), expect.stringMatching(/empty/),
    ]);
    expect(active("PROGRAM-G1")).toHaveLength(2);
    expect(driveMock.uploadFile).toHaveBeenCalledTimes(2); // refused files never reach Drive
  });

  it("a Drive failure for one file is reported for that file only; retrying just that file adds it once (no duplicates)", async () => {
    await saveProgram("PROGRAM-G1");
    driveMock.uploadFile.mockRejectedValueOnce(new Error("drive down")).mockRejectedValueOnce(new Error("drive down"));
    // first request: file 1 fails, file 2 stores? (two rejections queued for the first two uploads)
    const first = await upload("PROGRAM-G1", [png("a.png"), png("b.png"), png("c.png")]);
    const body = await first.json();
    expect(body).toMatchObject({ stored: 1, failed: 2 });
    expect(body.results.map((r: any) => r.ok)).toEqual([false, false, true]);
    expect(active("PROGRAM-G1")).toHaveLength(1);
    const retry = await (await upload("PROGRAM-G1", [png("a.png"), png("b.png")])).json();
    expect(retry).toMatchObject({ success: true, stored: 2 });
    expect(active("PROGRAM-G1")).toHaveLength(3);
    expect(new Set(active("PROGRAM-G1").map((r) => r.fileId)).size).toBe(3);
  });

  it("a metadata write failure never leaves a gallery entry or an orphan file: the Drive file is deleted again and the file is reported failed", async () => {
    await saveProgram("PROGRAM-G1");
    const { programImageRepository } = await import("@/lib/catalog/programImages");
    const spy = vi.spyOn(programImageRepository, "save").mockRejectedValueOnce(new Error("Sheets write failed"));
    const res = await upload("PROGRAM-G1", [png("a.png")]);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ success: false, stored: 0, failed: 1 });
    expect(body.results[0].error).toMatch(/removed again/);
    expect(active("PROGRAM-G1")).toHaveLength(0);
    expect(driveMock.deleteFile).toHaveBeenCalledWith("DRIVEFILE_0001");
    spy.mockRestore();
  });

  it("requires an administrator and an existing program", async () => {
    await saveProgram("PROGRAM-G1");
    authState.role = "none";
    expect((await upload("PROGRAM-G1", [png("a.png")])).status).toBe(401);
    authState.role = "admin";
    expect((await upload("PROGRAM-NOPE", [png("a.png")])).status).toBe(404);
    expect(rows("Program_Images")).toHaveLength(0);
  });
});

describe("multi-image gallery: order, cover, replace, remove", () => {
  const seed = async () => {
    await saveProgram("PROGRAM-G1");
    await upload("PROGRAM-G1", [png("a.png"), png("b.png"), png("c.png"), png("d.png")]);
    return active("PROGRAM-G1").map((r) => r.id);
  };

  it("reorders the detail gallery and changes the card cover independently of that order; captions and alt text are saved", async () => {
    const ids = await seed();
    const res = await patch({ programId: "PROGRAM-G1", order: [ids[3], ids[0], ids[1], ids[2]], coverId: ids[2], items: [{ id: ids[3], caption: "Moved first", alt: "Alt first" }] });
    expect(res.status).toBe(200);
    const p = await publicProgram("PROGRAM-G1");
    expect(p.images.map((i: any) => i.id)).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    expect(p.images[0]).toMatchObject({ caption: "Moved first", alt: "Alt first" });
    expect(p.images.filter((i: any) => i.isCover)).toHaveLength(1);
    expect(p.coverUrl).toBe(p.images.find((i: any) => i.id === ids[2]).url);
    // changing only the cover keeps the order
    await patch({ programId: "PROGRAM-G1", order: p.images.map((i: any) => i.id), coverId: ids[0] });
    const q = await publicProgram("PROGRAM-G1");
    expect(q.images.map((i: any) => i.id)).toEqual(p.images.map((i: any) => i.id));
    expect(q.coverUrl).toBe(q.images.find((i: any) => i.id === ids[0]).url);
  });

  it("refuses an incomplete order, a foreign image id and an unknown cover; nothing changes", async () => {
    const ids = await seed();
    await saveProgram("PROGRAM-G2");
    await upload("PROGRAM-G2", [png("x.png")]);
    const foreign = active("PROGRAM-G2")[0].id;
    const before = JSON.stringify(rows("Program_Images"));
    expect((await patch({ programId: "PROGRAM-G1", order: [ids[0], ids[1]] })).status).toBe(409);
    expect((await patch({ programId: "PROGRAM-G1", order: [ids[0], ids[1], ids[2], foreign] })).status).toBe(409);
    expect((await patch({ programId: "PROGRAM-G1", order: ids, coverId: foreign })).status).toBe(400);
    expect(JSON.stringify(rows("Program_Images"))).toBe(before);
  });

  it("replacing keeps caption, order and cover, points at the new file and deletes the old one", async () => {
    const ids = await seed();
    await patch({ programId: "PROGRAM-G1", order: ids, items: [{ id: ids[1], caption: "Keep me", alt: "Keep alt" }] });
    const old = active("PROGRAM-G1")[1].fileId;
    const res = await upload("PROGRAM-G1", [png("new.png")], { replaceId: ids[1] });
    expect(res.status).toBe(200);
    const row = active("PROGRAM-G1")[1];
    expect(row).toMatchObject({ id: ids[1], caption: "Keep me", alt: "Keep alt", sortOrder: "1" });
    expect(row.fileId).not.toBe(old);
    expect(driveMock.deleteFile).toHaveBeenCalledWith(old);
    expect(active("PROGRAM-G1")).toHaveLength(4);
  });

  it("removing keeps the record (marked removed), promotes a new cover when needed, deletes the Drive file and leaves other images in order", async () => {
    const ids = await seed();
    const cover = active("PROGRAM-G1")[0];
    const res = await del({ programId: "PROGRAM-G1", id: cover.id });
    expect(res.status).toBe(200);
    expect(rows("Program_Images").find((r) => r.id === cover.id)?.removedAt).toBeTruthy();
    expect(driveMock.deleteFile).toHaveBeenCalledWith(cover.fileId);
    const left = active("PROGRAM-G1");
    expect(left.map((r) => r.id)).toEqual([ids[1], ids[2], ids[3]]);
    expect(left.filter((r) => r.isCover === "true")).toHaveLength(1);
    expect(left[0].isCover).toBe("true");
    expect((await del({ programId: "PROGRAM-G1", id: cover.id })).status).toBe(404); // already removed
  });

  it("a successful gallery change refreshes the public pages; a failed refresh is reported while the change stays saved", async () => {
    await saveProgram("PROGRAM-G1");
    revalidateTag.mockReset();
    const ok = await (await upload("PROGRAM-G1", [png("a.png")])).json();
    expect(ok.publication).toMatchObject({ persisted: true, publicPagesRefreshed: true });
    expect(revalidateTag).toHaveBeenCalledWith("public-catalog", { expire: 0 });
    revalidateTag.mockImplementationOnce(() => { throw new Error("revalidate unavailable"); });
    const bad = await (await upload("PROGRAM-G1", [png("b.png")])).json();
    expect(bad.publication).toMatchObject({ persisted: true, publicPagesRefreshed: false });
    expect(active("PROGRAM-G1")).toHaveLength(2);
  });
});

describe("gallery files are public only while the program is open", () => {
  const media = async (fileId: string) => {
    authState.role = "none";
    const res = await (await import("@/app/api/media/[fileId]/route")).GET(new NextRequest(`http://t/api/media/${fileId}`), { params: Promise.resolve({ fileId }) });
    authState.role = "admin";
    return res.status;
  };

  it("open program: 200 for visitors; Draft or Completed: 401; removed image: 401", async () => {
    await saveProgram("PROGRAM-G1", "Draft");
    await upload("PROGRAM-G1", [png("a.png"), png("b.png")]);
    const [a, b] = active("PROGRAM-G1");
    expect(await media(a.fileId)).toBe(401);
    await saveProgram("PROGRAM-G1", "Active");
    expect(await media(a.fileId)).toBe(200);
    await del({ programId: "PROGRAM-G1", id: b.id });
    expect(await media(b.fileId)).toBe(401);
    await saveProgram("PROGRAM-G1", "Completed");
    expect(await media(a.fileId)).toBe(401);
  });
});

describe("sitemap", () => {
  it("lists only open entries at their canonical /programs/<id> route, without duplicates, and follows publish/unpublish", async () => {
    await saveProgram("PROGRAM-S1", "Active");
    await saveProgram("PROGRAM-S2", "Draft");
    await saveProgram("PROGRAM-S3", "Urgent");
    const sitemap = (await import("@/app/sitemap")).default;
    const urls = async () => (await sitemap()).map((e) => e.url);
    let u = await urls();
    expect(u).toContain("https://daaraynorg.com/programs/PROGRAM-S1");
    expect(u).toContain("https://daaraynorg.com/programs/PROGRAM-S3");
    expect(u).not.toContain("https://daaraynorg.com/programs/PROGRAM-S2");
    expect(new Set(u).size).toBe(u.length);
    expect(u).toEqual(expect.arrayContaining(["https://daaraynorg.com", "https://daaraynorg.com/programs"]));
    await saveProgram("PROGRAM-S1", "Inactive");
    await saveProgram("PROGRAM-S2", "Active");
    u = await urls();
    expect(u).not.toContain("https://daaraynorg.com/programs/PROGRAM-S1");
    expect(u).toContain("https://daaraynorg.com/programs/PROGRAM-S2");
  });

  it("when the catalog cannot be read only the static URLs are listed (nothing is invented)", async () => {
    const real = fakeSheets.getAllRows.bind(fakeSheets);
    (fakeSheets as any).getAllRows = async () => { throw new Error("Sheets unavailable"); };
    (await import("@/lib/catalog/programs")).invalidatePublicPrograms();
    const urls = (await (await import("@/app/sitemap")).default()).map((e) => e.url);
    (fakeSheets as any).getAllRows = real;
    expect(urls.some((x) => x.includes("/programs/"))).toBe(false);
    expect(urls).toContain("https://daaraynorg.com/programs");
  });
});

describe("cards may be text-only: the card image can be removed without touching the gallery", () => {
  it("coverId null clears the cover (no card picture), the detail gallery keeps all images in order; a cover can be chosen again", async () => {
    await saveProgram("PROGRAM-G1");
    await upload("PROGRAM-G1", [png("a.png"), png("b.png")]);
    const ids = active("PROGRAM-G1").map((r) => r.id);
    expect((await patch({ programId: "PROGRAM-G1", order: ids, coverId: null })).status).toBe(200);
    const p = await publicProgram("PROGRAM-G1");
    expect(p.images).toHaveLength(2);
    expect(p.images.some((i: any) => i.isCover)).toBe(false);
    expect(p.coverUrl).toBe("");
    await patch({ programId: "PROGRAM-G1", order: ids, coverId: ids[1] });
    expect((await publicProgram("PROGRAM-G1")).coverUrl).toBe(p.images[1].url);
    // an ordinary edit without coverId keeps whatever is selected
    await patch({ programId: "PROGRAM-G1", order: ids });
    expect((await publicProgram("PROGRAM-G1")).coverUrl).toBe(p.images[1].url);
  });
});

describe("the legacy single image is only a fallback", () => {
  it("a program with a gallery and no selected cover shows no card picture even if the cause still has a legacy imageUrl; without a gallery the legacy image is used", async () => {
    const { POST } = await import("@/app/api/admin/programs/route");
    const save = (over: any) => POST(new NextRequest("http://t/api/admin/programs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "PROGRAM-LEG", kind: "project", title: "Legacy image", targetAmount: 1000, status: "Active", imageUrl: "/api/media/LEGACYIMG0001", content: { template: "relief" }, ...over }) }));
    expect((await save({})).status).toBe(200);
    expect((await publicProgram("PROGRAM-LEG")).coverUrl).toBe("/api/media/LEGACYIMG0001");
    await upload("PROGRAM-LEG", [png("a.png")]);
    const ids = active("PROGRAM-LEG").map((r) => r.id);
    await patch({ programId: "PROGRAM-LEG", order: ids, coverId: null });
    expect((await publicProgram("PROGRAM-LEG")).coverUrl).toBe("");
  });
});
