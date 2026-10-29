import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { driveService } from "@/lib/google/drive";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { CatalogError } from "@/lib/catalog/errors";
import { addImage, listImages, removeImage, replaceImageFile, updateGallery, validateImageFile, toImageView, MAX_IMAGES_PER_PROGRAM } from "@/lib/catalog/programImages";
import { refreshPublicCatalog } from "@/lib/catalog/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // several Drive uploads in one request

const FOLDER = "Program Images";

async function requireProgram(programId: string) {
  const all = await causeRepository.getAll(true);
  if (!all.some((c) => c.id === programId)) throw new CatalogError("That program does not exist yet. Save it first, then add images.", 404);
}

async function dropFile(fileId: string) {
  // Best effort: a leftover private Drive file is harmless; a failed metadata write must never leave a gallery row pointing nowhere.
  await driveService.deleteFile(fileId).catch((err: any) => console.warn(`[ProgramImages] Could not delete Drive file ${fileId}:`, err?.message));
}

const fail = (error: any) => {
  if (error instanceof CatalogError) return NextResponse.json({ success: false, error: error.message }, { status: error.httpStatus });
  console.error("[API/ProgramImages]", error?.message);
  return NextResponse.json({ success: false, error: "The gallery could not be updated in Google Sheets. Nothing was changed." }, { status: 500 });
};

/** Gallery of one program, in display order. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const programId = new URL(req.url).searchParams.get("programId") || "";
  if (!programId) return NextResponse.json({ success: false, error: "programId is required." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, images: (await listImages(programId, true)).map(toImageView) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Upload one or several images (field "files", optional JSON "meta" aligned by index: [{caption, alt}]) or replace one
 * (field "replaceId" with a single file). Each file is validated, stored in Drive, THEN recorded in Sheets; if the record
 * cannot be written the Drive file is removed again. The response lists every file's outcome, so a partial upload shows exactly
 * what succeeded and only the failed files need to be sent again (nothing already stored is duplicated).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid upload." }, { status: 400 });
  }
  const programId = String(form.get("programId") || "");
  const replaceId = String(form.get("replaceId") || "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  let meta: { caption?: string; alt?: string }[] = [];
  try {
    meta = JSON.parse(String(form.get("meta") || "[]"));
  } catch {
    /* ignore malformed meta */
  }
  if (!programId) return NextResponse.json({ success: false, error: "programId is required." }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ success: false, error: "No image was uploaded." }, { status: 400 });
  if (replaceId && files.length !== 1) return NextResponse.json({ success: false, error: "Replacing an image takes exactly one file." }, { status: 400 });

  try {
    await requireProgram(programId);
    const existing = (await listImages(programId, true)).length;
    if (!replaceId && existing + files.length > MAX_IMAGES_PER_PROGRAM) {
      throw new CatalogError(`A program can have at most ${MAX_IMAGES_PER_PROGRAM} images (it has ${existing}).`, 400);
    }
  } catch (e) {
    return fail(e);
  }

  const results: { name: string; ok: boolean; error?: string; image?: ReturnType<typeof toImageView> }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const problem = validateImageFile(file);
    if (problem) {
      results.push({ name: file.name, ok: false, error: problem });
      continue;
    }
    let fileId = "";
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const stored = await driveService.uploadFile(Buffer.from(await file.arrayBuffer()), safeName, file.type, FOLDER, programId, admin.email);
      fileId = stored.drive_file_id;
    } catch (e: any) {
      results.push({ name: file.name, ok: false, error: "The file could not be stored in Google Drive. Nothing was added." });
      continue;
    }
    try {
      if (replaceId) {
        const { oldFileId } = await replaceImageFile(programId, replaceId, fileId, file.type);
        await dropFile(oldFileId);
        const current = (await listImages(programId, true)).find((x) => x.id === replaceId);
        results.push({ name: file.name, ok: true, image: current && toImageView(current) });
      } else {
        const image = await addImage(programId, fileId, file.type, meta[i] || {});
        results.push({ name: file.name, ok: true, image: toImageView(image) });
      }
    } catch (e: any) {
      await dropFile(fileId); // metadata not stored: do not leave an orphan file
      results.push({ name: file.name, ok: false, error: e instanceof CatalogError ? e.message : "The image details could not be saved in Google Sheets. The file was removed again; try once more." });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const refreshed = okCount > 0 ? refreshPublicCatalog() : true;
  return NextResponse.json(
    { success: okCount === results.length, stored: okCount, failed: results.length - okCount, results, publication: { persisted: okCount > 0, publicPagesRefreshed: refreshed } },
    { status: okCount === 0 ? 502 : 200, headers: { "Cache-Control": "no-store" } }
  );
}

/** Reorder, set the cover, edit captions/alt text. Body: { programId, order: [imageId…], coverId?, items?: [{id, caption, alt}] }. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
  try {
    const programId = String(body?.programId || "");
    if (!programId || !Array.isArray(body?.order)) throw new CatalogError("programId and order are required.");
    await requireProgram(programId);
    const images = await updateGallery(programId, { order: body.order.map(String), coverId: body.coverId === null ? null : body.coverId ? String(body.coverId) : undefined, items: Array.isArray(body.items) ? body.items : [] });
    const refreshed = refreshPublicCatalog();
    return NextResponse.json({ success: true, images: images.map(toImageView), publication: { persisted: true, publicPagesRefreshed: refreshed } });
  } catch (e) {
    return fail(e);
  }
}

/** Remove one image from the gallery. Body: { programId, id }. The record is kept (marked removed); the Drive file is deleted after. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
  try {
    const programId = String(body?.programId || "");
    const id = String(body?.id || "");
    if (!programId || !id) throw new CatalogError("programId and id are required.");
    const { fileId, remaining } = await removeImage(programId, id);
    await dropFile(fileId);
    const refreshed = refreshPublicCatalog();
    return NextResponse.json({ success: true, images: remaining.map(toImageView), publication: { persisted: true, publicPagesRefreshed: refreshed } });
  } catch (e) {
    return fail(e);
  }
}
