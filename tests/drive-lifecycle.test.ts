import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetWorld } from "./helpers/mocks";
import { quotaError, serverError } from "./helpers/fakeGoogleApi";

// Real DriveService + retry policy, with the OAuth-backed Drive client replaced by a scriptable fake.
const drive = vi.hoisted(() => ({
  calls: { list: 0, create: 0, get: 0 },
  failCreate: [] as any[],
  failList: [] as any[],
  failAll: null as any,
}));
vi.mock("@/lib/google/driveOAuth", () => ({
  getDriveApi: async () => {
    if (drive.failAll) throw drive.failAll;
    return {
      files: {
        list: async () => {
          drive.calls.list++;
          const e = drive.failList.shift();
          if (e) throw e;
          return { data: { files: [{ id: "FOLDER_ID_0001" }] } };
        },
        create: async () => {
          drive.calls.create++;
          const e = drive.failCreate.shift();
          if (e) throw e;
          return { data: { id: "FILE_ID_0000001", name: "p.png", mimeType: "image/png", size: "1", createdTime: new Date().toISOString() } };
        },
        get: async () => {
          drive.calls.get++;
          throw drive.failAll ?? Object.assign(new Error("File not found: x"), { code: 404 });
        },
      },
    };
  },
}));

const load = async () => {
  const { DriveService } = await vi.importActual<typeof import("@/lib/google/drive")>("@/lib/google/drive");
  const retry = await import("@/lib/google/retry");
  retry.setRetrySleep(async () => undefined);
  return new DriveService("ROOTFOLDER0001");
};
const upload = (svc: any) => svc.uploadFile(Buffer.from("x"), "p.png", "image/png", "Payment Proofs");

beforeEach(async () => {
  await resetWorld();
  drive.calls = { list: 0, create: 0, get: 0 };
  drive.failCreate = [];
  drive.failList = [];
  drive.failAll = null;
});

describe("Drive reliability", () => {
  it("a transient error on the folder lookup is retried; a quota error on the upload is retried", async () => {
    const svc = await load();
    drive.failList.push(serverError());
    drive.failCreate.push(quotaError());
    const meta = await upload(svc);
    expect(meta).toMatchObject({ drive_file_id: "FILE_ID_0000001", storage_backend: "google_drive" });
    expect(drive.calls.list).toBe(2);
    expect(drive.calls.create).toBe(2);
  });

  it("an ambiguous 503 on the upload itself is NOT retried (it could duplicate the file) and is reported as a failure", async () => {
    const svc = await load();
    drive.failCreate.push(serverError());
    await expect(upload(svc)).rejects.toThrow(/could not be stored in Google Drive/);
    expect(drive.calls.create).toBe(1);
  });

  it("a revoked or expired authorisation is reported as 'reconnect required', never as a generic failure or a local save", async () => {
    const svc = await load();
    drive.failAll = Object.assign(new Error("invalid_grant"), { code: 400 });
    await expect(upload(svc)).rejects.toThrow(/expired or was revoked.*reconnect/i);
  });

  it("a revoked authorisation surfaces as invalid_grant when reading a file (the media route maps this to 503 DRIVE_REAUTH_REQUIRED)", async () => {
    const svc = await load();
    drive.failAll = Object.assign(new Error("invalid_grant"), { code: 400 });
    await expect(svc.getFileStream("SOMEFILE000001")).rejects.toThrow(/invalid_grant/);
  });
});

describe("OAuth token lifecycle", () => {
  it("assumes Google Testing mode (7-day refresh-token expiry) unless production is declared", async () => {
    const oauth = await vi.importActual<typeof import("@/lib/google/driveOAuth")>("@/lib/google/driveOAuth");
    delete process.env.GOOGLE_OAUTH_PUBLISHING_STATUS;
    expect(oauth.oauthPublishingStatus()).toBe("testing");
    process.env.GOOGLE_OAUTH_PUBLISHING_STATUS = "production";
    expect(oauth.oauthPublishingStatus()).toBe("production");
    delete process.env.GOOGLE_OAUTH_PUBLISHING_STATUS;
    expect(oauth.TESTING_MODE_TOKEN_DAYS).toBe(7);
  });
});
