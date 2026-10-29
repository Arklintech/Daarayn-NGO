import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authState } from "./helpers/mocks";

const created = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock("@/lib/google/driveOAuth", async (orig) => ({
  ...(await orig<any>()),
  getDriveApi: vi.fn(async () => ({ files: { create: async (a: any) => { created.calls.push(a); return { data: { id: "NEWROOT_000000000000000" } }; } } })),
}));

beforeEach(() => { created.calls = []; authState.role = "admin"; delete process.env.GOOGLE_DRIVE_SCOPE_MODE; });

describe("Drive scope mode", () => {
  it("default is the full `drive` scope (current behaviour unchanged); mode=file requests only the non-sensitive drive.file scope", async () => {
    const m = await vi.importActual<typeof import("@/lib/google/driveOAuth")>("@/lib/google/driveOAuth");
    expect(m.driveOAuthScopes()).toEqual(["https://www.googleapis.com/auth/drive"]);
    process.env.GOOGLE_DRIVE_SCOPE_MODE = "file";
    expect(m.driveScopeMode()).toBe("file");
    expect(m.driveOAuthScopes()).toEqual(["https://www.googleapis.com/auth/drive.file"]);
    process.env.GOOGLE_DRIVE_SCOPE_MODE = "weird";
    expect(m.driveOAuthScopes()).toEqual(["https://www.googleapis.com/auth/drive"]); // unknown value never narrows or widens silently
  });

  it("the consent URL carries exactly the selected scope", async () => {
    const m = await vi.importActual<typeof import("@/lib/google/driveOAuth")>("@/lib/google/driveOAuth");
    Object.assign(process.env, { GOOGLE_OAUTH_CLIENT_ID: "123-abc.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "x", GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3100/api/admin/google-drive/callback" });
    process.env.GOOGLE_DRIVE_SCOPE_MODE = "file";
    const url = new URL(m.buildAuthUrl("state123"));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
  });

  it("create-root requires an administrator, creates one folder owned by the app and returns only its id", async () => {
    const { POST } = await import("@/app/api/admin/google-drive/create-root/route");
    const req = (body: any) => new NextRequest("http://t/api/admin/google-drive/create-root", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    authState.role = "none";
    expect((await POST(req({}))).status).toBe(401);
    expect(created.calls).toHaveLength(0);
    authState.role = "admin";
    const ok = await POST(req({ name: "Daarayn <script> Files" }));
    const body: any = await ok.json();
    expect(ok.status).toBe(200);
    expect(body.folderId).toBe("NEWROOT_000000000000000");
    expect(created.calls[0].requestBody).toMatchObject({ mimeType: "application/vnd.google-apps.folder", name: "Daarayn script Files" });
    expect(JSON.stringify(body)).not.toMatch(/token|secret/i);
  });
});
