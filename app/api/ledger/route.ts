import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import fs from "fs";
import path from "path";

let useLocalFallback = false;
const dbPath = path.join(process.cwd(), "data", "ledger.json");

function getLocalLedger() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
  }
  const data = fs.readFileSync(dbPath, "utf8");
  return JSON.parse(data);
}

export async function GET() {
  if (!useLocalFallback) {
    try {
      const snapshot = await getDocs(collection(db, "publicLedger"));
      const ledger: any[] = [];
      snapshot.forEach((doc) => {
        ledger.push({ id: doc.id, ...doc.data() });
      });
      ledger.sort((a, b) => b.id.localeCompare(a.id));
      
      const response = NextResponse.json(ledger);
      response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
      return response;
    } catch (error: any) {
      console.warn("Firestore API read failed, switching to local fallback:", error.message);
      useLocalFallback = true;
    }
  }

  try {
    const localData = getLocalLedger();
    const response = NextResponse.json(localData);
    response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    return response;
  } catch (error) {
    console.error("Local database read error:", error);
    return NextResponse.json({ error: "Failed to read contribution ledger." }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
