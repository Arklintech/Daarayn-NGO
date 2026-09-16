import { getDriveClient, GOOGLE_DRIVE_ROOT_FOLDER_ID } from "../lib/google/client";
import { Readable } from "stream";

async function testDriveUpload() {
  const drive = getDriveClient();
  if (!drive) throw new Error("No drive client");

  console.log("Root Folder ID:", GOOGLE_DRIVE_ROOT_FOLDER_ID);
  const rootMeta = await drive.files.get({
    fileId: GOOGLE_DRIVE_ROOT_FOLDER_ID,
    fields: "id, name, mimeType, shared, driveId, capabilities",
    supportsAllDrives: true
  });
  console.log("Root folder metadata:", rootMeta.data);

  // Try creating a test text file with supportsAllDrives: true
  const stream = new Readable();
  stream.push("test payment proof content");
  stream.push(null);

  try {
    const res = await drive.files.create({
      requestBody: {
        name: "test-quota-check.txt",
        parents: [GOOGLE_DRIVE_ROOT_FOLDER_ID]
      },
      media: {
        mimeType: "text/plain",
        body: stream
      },
      fields: "id, name",
      supportsAllDrives: true
    });
    console.log("SUCCESS! Created file:", res.data);
  } catch (err: any) {
    console.error("Upload failed with supportsAllDrives:", err.message);
  }
}

testDriveUpload().catch(console.error);
