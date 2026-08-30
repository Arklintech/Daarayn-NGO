import { NextResponse } from "next/server";
import { runMigration } from "@/scripts/migrate-firestore-to-sheets";

export async function POST() {
  try {
    const summary = await runMigration();
    return NextResponse.json({
      success: true,
      message: "Firestore -> Google Sheets & Drive Migration Executed Successfully",
      summary,
    });
  } catch (error: any) {
    console.error("[SeedSheetsAPI] Migration failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Migration failed" },
      { status: 500 }
    );
  }
}
