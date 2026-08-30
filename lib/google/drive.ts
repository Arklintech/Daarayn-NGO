import { getDriveClient, GOOGLE_DRIVE_ROOT_FOLDER_ID } from "./client";
import { Readable } from "stream";

export interface DriveFileMetadata {
  drive_file_id: string;
  original_filename: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
  uploaded_by?: string;
  related_entity_id?: string;
  folder_category: string;
}

export class DriveService {
  private rootFolderId: string;
  private folderCache: Map<string, string> = new Map();

  constructor(rootFolderId: string = GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    this.rootFolderId = rootFolderId;
  }

  private get drive() {
    const client = getDriveClient();
    if (!client) {
      throw new Error("Google Drive client is not initialized.");
    }
    return client;
  }

  /**
   * Finds or creates a subfolder by name under a given parent folder ID.
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
      });

      if (res.data.files && res.data.files.length > 0) {
        const folderId = res.data.files[0].id!;
        this.folderCache.set(cacheKey, folderId);
        return folderId;
      }

      // Create missing folder
      const createRes = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        },
        fields: "id",
      });

      const newFolderId = createRes.data.id!;
      this.folderCache.set(cacheKey, newFolderId);
      return newFolderId;
    } catch (err: any) {
      console.error(`[DriveService] Failed to get/create folder ${folderName}:`, err.message);
      throw err;
    }
  }

  /**
   * Uploads a Buffer file to Google Drive.
   */
  public async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    categoryFolder: string = "Other Secure Files",
    relatedEntityId?: string,
    uploadedBy?: string
  ): Promise<DriveFileMetadata> {
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
      };
    } catch (err: any) {
      console.error(`[DriveService] Failed to upload file ${filename}:`, err.message);
      throw err;
    }
  }

  /**
   * Fetches a file stream from Google Drive for server-proxied delivery.
   */
  public async getFileStream(fileId: string) {
    try {
      const metadata = await this.drive.files.get({
        fileId,
        fields: "id, name, mimeType, size",
      });

      const res = await this.drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" }
      );

      return {
        stream: res.data as Readable,
        mimeType: metadata.data.mimeType || "application/octet-stream",
        filename: metadata.data.name || "file",
        size: metadata.data.size,
      };
    } catch (err: any) {
      console.error(`[DriveService] Failed to get file stream for ${fileId}:`, err.message);
      throw err;
    }
  }
}

export const driveService = new DriveService();
