/** Pure image rules and view types (safe to import from client code). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_PROGRAM = 30;

export interface ProgramImage {
  id: string;
  programId: string;
  fileId: string;
  caption: string;
  alt: string;
  sortOrder: number;
  isCover: boolean;
  mimeType: string;
  createdAt: string;
  removedAt: string;
}

/** What the public site and the editor receive. */
export interface ProgramImageView {
  id: string;
  url: string;
  caption: string;
  alt: string;
  sortOrder: number;
  isCover: boolean;
}

export const imageUrl = (fileId: string) => `/api/media/${fileId}`;
export const toImageView = (i: ProgramImage): ProgramImageView => ({ id: i.id, url: imageUrl(i.fileId), caption: i.caption, alt: i.alt, sortOrder: i.sortOrder, isCover: i.isCover });

export function validateImageFile(file: { name: string; type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return `"${file.name}" is not a supported image. Use PNG, JPEG or WebP.`;
  if (file.size <= 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_IMAGE_BYTES) return `"${file.name}" is larger than ${MAX_IMAGE_BYTES / 1048576} MB.`;
  return null;
}

