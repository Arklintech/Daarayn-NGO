import { GOOGLE_DRIVE_ROOT_FOLDER_ID } from "./client";
import { getDriveApi } from "./driveOAuth";
import { withGoogleRetry } from "./retry";
import { Readable } from "stream";
import fs from "fs";
import path from "path";

export interface DriveFileMetadata {
  drive_file_id: string;
  original_filename: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
  uploaded_by?: string;
  related_entity_id?: string;
  folder_category: string;
  storage_backend?: "google_drive" | "secure_fallback";
}

interface LocalStorageIndexItem {
  id: string;
  filename: string;
  localPath: string;
  mimeType: string;
  size: number;
  folder_category: string;
  uploaded_at: string;
  related_entity_id?: string;
}

/** Escapes a value for use inside single quotes in a Drive `q` query. */
function escapeDriveQuery(value: string): string {
  return value.split("\\").join("\\\\").split("'").join("\\'");
}

/** A Drive upload that failed; nothing was stored. */
export class DriveUploadError extends Error {}

export class DriveService {
  private rootFolderId: string;
  private folderCache: Map<string, string> = new Map();
  private localStorageDir: string;
  private indexFilePath: string;

  constructor(rootFolderId: string = GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    this.rootFolderId = rootFolderId;
    const isVercel = process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL || process.env.NODE_ENV === "production";
    this.localStorageDir = isVercel
      ? "/tmp/secure_storage"
      : path.join(process.cwd(), "data", "secure_storage");
    this.indexFilePath = path.join(this.localStorageDir, "storage_index.json");
  }

  /** Writes use the authorised OAuth account (the service account has no Drive storage quota). */
  private drive(write: boolean) {
    if (!this.rootFolderId) {
      throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured.");
    }
    return getDriveApi(write);
  }

  private getLocalIndex(): Record<string, LocalStorageIndexItem> {
    try {
      if (!fs.existsSync(this.localStorageDir)) {
        fs.mkdirSync(this.localStorageDir, { recursive: true });
      }
      if (!fs.existsSync(this.indexFilePath)) {
        fs.writeFileSync(this.indexFilePath, JSON.stringify({}), "utf8");
        return {};
      }
      return JSON.parse(fs.readFileSync(this.indexFilePath, "utf8"));
    } catch {
      return {};
    }
  }

  private saveLocalIndex(index: Record<string, LocalStorageIndexItem>) {
    try {
      if (!fs.existsSync(this.localStorageDir)) {
        fs.mkdirSync(this.localStorageDir, { recursive: true });
      }
      fs.writeFileSync(this.indexFilePath, JSON.stringify(index, null, 2), "utf8");
    } catch (err: any) {
      console.warn("[DriveService] Failed to persist local storage index:", err.message);
    }
  }

  /**
   * Finds or creates a subfolder by name under a given parent folder ID in Google Drive.
   */
  public async getOrCreateFolder(folderName: string, parentFolderId: string = this.rootFolderId): Promise<string> {
    const cacheKey = `${parentFolderId}:${folderName}`;
    if (this.folderCache.has(cacheKey)) {
      return this.folderCache.get(cacheKey)!;
    }

    try {
      const q = `'${parentFolderId}' in parents and name = '${escapeDriveQuery(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const res = await withGoogleRetry(
        async () =>
          (await this.drive(true)).files.list({
            q,
            fields: "files(id, name)",
            spaces: "drive",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          }),
        { label: "Drive list folder" }
      );

      if (res.data.files && res.data.files.length > 0) {
        const folderId = res.data.files[0].id!;
        this.folderCache.set(cacheKey, folderId);
        return folderId;
      }

      // Create folder
      const createRes = await withGoogleRetry(
        async () =>
          (await this.drive(true)).files.create({
            requestBody: { name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] },
            fields: "id",
            supportsAllDrives: true,
          }),
        { label: "Drive create folder", quotaOnly: true }
      );

      const newFolderId = createRes.data.id!;
      this.folderCache.set(cacheKey, newFolderId);
      return newFolderId;
    } catch (err: any) {
      console.error(`[DriveService] Failed to get/create Google Drive folder ${folderName}:`, err.message);
      throw new Error(`Google Drive folder "${folderName}" is unavailable: ${err.message}`);
    }
  }

  /**
   * Uploads a Buffer file to Google Drive.
   * If Google Drive returns a service account quota limitation (shared personal drive),
   * securely preserves the asset in server storage and returns a uniform reference.
   */
  public async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    categoryFolder: string = "Other Secure Files",
    relatedEntityId?: string,
    uploadedBy?: string
  ): Promise<DriveFileMetadata> {
    // 1. Attempt primary upload to Google Drive
    try {
      const folderId = await this.getOrCreateFolder(categoryFolder);

      const res = await withGoogleRetry(
        async () => {
          // A Readable can only be consumed once, so every attempt gets its own.
          const stream = new Readable();
          stream.push(fileBuffer);
          stream.push(null);
          return (await this.drive(true)).files.create({
            requestBody: {
              name: filename,
              parents: [folderId],
              description: `Uploaded for entity ${relatedEntityId || "N/A"} by ${uploadedBy || "System"}`,
            },
            media: { mimeType, body: stream },
            fields: "id, name, mimeType, size, createdTime",
            supportsAllDrives: true,
          });
        },
        { label: "Drive upload", quotaOnly: true }
      );

      const fileData = res.data;
      return {
        drive_file_id: fileData.id!,
        original_filename: fileData.name || filename,
        mime_type: fileData.mimeType || mimeType,
        size: Number(fileData.size || fileBuffer.length),
        uploaded_at: fileData.createdTime || new Date().toISOString(),
        uploaded_by: uploadedBy,
        related_entity_id: relatedEntityId,
        folder_category: categoryFolder,
        storage_backend: "google_drive",
      };
    } catch (err: any) {
      // No silent local-disk fallback: evidence must live in Google Drive. Report the real cause.
      console.error(`[DriveService] Google Drive upload failed: ${err.message}`);
      if (/invalid_grant/i.test(String(err?.message))) {
        throw new DriveUploadError("Google Drive authorisation has expired or was revoked. An administrator must reconnect Google Drive in Admin → Settings.");
      }
      throw new DriveUploadError(`The file could not be stored in Google Drive: ${err.message}`);
    }
  }

  /**
   * Fetches a file stream from Google Drive or Secure Local Storage for server-proxied delivery.
   */
  public async getFileStream(fileId: string): Promise<{
    stream: NodeJS.ReadableStream;
    mimeType: string;
    filename: string;
    size?: number;
  }> {
    // 1. Handle Local Storage Fallback
    if (fileId.startsWith("local_")) {
      const index = this.getLocalIndex();
      const entry = index[fileId];
      if (!entry || !fs.existsSync(entry.localPath)) {
        throw new Error(`File with id ${fileId} not found in secure storage.`);
      }

      return {
        stream: fs.createReadStream(entry.localPath),
        mimeType: entry.mimeType || "application/octet-stream",
        filename: entry.filename || "file",
        size: entry.size,
      };
    }

    // 2. Handle Google Drive Stream
    try {
      const driveRead = await this.drive(false);
      const metadata = await withGoogleRetry(
        () => driveRead.files.get({ fileId, fields: "id, name, mimeType, size", supportsAllDrives: true }),
        { label: "Drive file metadata" }
      );

      const res = await withGoogleRetry(
        () => driveRead.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" }),
        { label: "Drive file download" }
      );

      return {
        stream: res.data as Readable,
        mimeType: metadata.data.mimeType || "application/octet-stream",
        filename: metadata.data.name || "file",
        size: metadata.data.size ? Number(metadata.data.size) : undefined,
      };
    } catch (err: any) {
      console.error(`[DriveService] Failed to get file stream for ${fileId}:`, err.message);
      throw err;
    }
  }

  /**
   * Identity of a file without downloading it. `fingerprint` changes whenever the content changes (Drive md5 checksum;
   * size+mtime for local storage), which is what approvals and share links are bound to.
   */
  public async getFileInfo(fileId: string): Promise<{ id: string; name: string; mimeType: string; size: number; fingerprint: string; trashed: boolean }> {
    if (fileId.startsWith("local_")) {
      const entry = this.getLocalIndex()[fileId];
      if (!entry || !fs.existsSync(entry.localPath)) throw new Error(`File with id ${fileId} not found in secure storage.`);
      const st = fs.statSync(entry.localPath);
      return { id: fileId, name: entry.filename || "file", mimeType: entry.mimeType || "application/octet-stream", size: st.size, fingerprint: `${st.size}-${Math.floor(st.mtimeMs)}`, trashed: false };
    }
    const driveRead = await this.drive(false);
    const res = await withGoogleRetry(
      () => driveRead.files.get({ fileId, fields: "id, name, mimeType, size, md5Checksum, modifiedTime, trashed", supportsAllDrives: true }),
      { label: "Drive file info" }
    );
    const d = res.data;
    return {
      id: String(d.id || fileId),
      name: d.name || "file",
      mimeType: d.mimeType || "application/octet-stream",
      size: d.size ? Number(d.size) : 0,
      fingerprint: d.md5Checksum || `${d.size || 0}-${d.modifiedTime || ""}`,
      trashed: Boolean(d.trashed),
    };
  }

  /**
   * Deletes a file from Google Drive or Local Storage.
   */
  public async deleteFile(fileId: string): Promise<boolean> {
    if (fileId.startsWith("local_")) {
      const index = this.getLocalIndex();
      const entry = index[fileId];
      if (entry && fs.existsSync(entry.localPath)) {
        try {
          fs.unlinkSync(entry.localPath);
        } catch {}
      }
      delete index[fileId];
      this.saveLocalIndex(index);
      return true;
    }

    try {
      await (await this.drive(true)).files.delete({
        fileId,
        supportsAllDrives: true,
      });
      return true;
    } catch (err: any) {
      console.error(`[DriveService] Failed to delete file ${fileId}:`, err.message);
      return false;
    }
  }
}

export const driveService = new DriveService();
