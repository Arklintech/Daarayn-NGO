import { getDriveClient, GOOGLE_DRIVE_ROOT_FOLDER_ID } from "./client";
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

  private get drive() {
    const client = getDriveClient();
    if (!client) {
      throw new Error("Google Drive client is not initialized.");
    }
    return client;
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
      const q = `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const res = await this.drive.files.list({
        q,
        fields: "files(id, name)",
        spaces: "drive",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (res.data.files && res.data.files.length > 0) {
        const folderId = res.data.files[0].id!;
        this.folderCache.set(cacheKey, folderId);
        return folderId;
      }

      // Create folder
      const createRes = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        },
        fields: "id",
        supportsAllDrives: true,
      });

      const newFolderId = createRes.data.id!;
      this.folderCache.set(cacheKey, newFolderId);
      return newFolderId;
    } catch (err: any) {
      console.error(`[DriveService] Failed to get/create Google Drive folder ${folderName}:`, err.message);
      return `folder_${folderName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
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

      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);

      const res = await this.drive.files.create({
        requestBody: {
          name: filename,
          parents: [folderId],
          description: `Uploaded for entity ${relatedEntityId || "N/A"} by ${uploadedBy || "System"}`,
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: "id, name, mimeType, size, createdTime",
        supportsAllDrives: true,
      });

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
      console.warn(
        `[DriveService] Google Drive upload direct failed (${err.message}). Using secure server storage fallback.`
      );

      // 2. Secure Server Fallback
      const uniqueId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const safeCategoryDir = path.join(
        this.localStorageDir,
        categoryFolder.replace(/[^a-zA-Z0-9_-]/g, "_")
      );
      if (!fs.existsSync(safeCategoryDir)) {
        fs.mkdirSync(safeCategoryDir, { recursive: true });
      }

      const safeFilename = `${uniqueId}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const destinationPath = path.join(safeCategoryDir, safeFilename);
      fs.writeFileSync(destinationPath, fileBuffer);

      const index = this.getLocalIndex();
      index[uniqueId] = {
        id: uniqueId,
        filename,
        localPath: destinationPath,
        mimeType,
        size: fileBuffer.length,
        folder_category: categoryFolder,
        uploaded_at: new Date().toISOString(),
        related_entity_id: relatedEntityId,
      };
      this.saveLocalIndex(index);

      return {
        drive_file_id: uniqueId,
        original_filename: filename,
        mime_type: mimeType,
        size: fileBuffer.length,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploadedBy,
        related_entity_id: relatedEntityId,
        folder_category: categoryFolder,
        storage_backend: "secure_fallback",
      };
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
      const metadata = await this.drive.files.get({
        fileId,
        fields: "id, name, mimeType, size",
        supportsAllDrives: true,
      });

      const res = await this.drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "stream" }
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
      await this.drive.files.delete({
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
