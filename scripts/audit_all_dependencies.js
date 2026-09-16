const fs = require("fs");
const path = require("path");

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== "node_modules" && f !== ".next" && f !== ".git") {
        walkDir(dirPath, callback);
      }
    } else {
      if (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx")) {
        callback(dirPath);
      }
    }
  });
}

const firestoreReads = [];
const firestoreWrites = [];
const firestoreListeners = [];
const firebaseStorageOps = [];
const sheetsReads = [];
const sheetsWrites = [];
const driveReads = [];
const driveWrites = [];
const realtimeSseOps = [];

walkDir(".", (filePath) => {
  const code = fs.readFileSync(filePath, "utf8");
  const lines = code.split("\n");

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Firestore Reads
    if (line.includes("getDoc(") || line.includes("getDocs(")) {
      firestoreReads.push({ file: filePath, line: lineNum, text: line.trim() });
    }
    // Firestore Writes
    if (line.includes("addDoc(") || line.includes("setDoc(") || line.includes("updateDoc(") || line.includes("deleteDoc(")) {
      firestoreWrites.push({ file: filePath, line: lineNum, text: line.trim() });
    }
    // Firestore Listeners
    if (line.includes("onSnapshot(")) {
      firestoreListeners.push({ file: filePath, line: lineNum, text: line.trim() });
    }

    // Firebase Storage Ops
    if (line.includes("firebase/storage") || line.includes("uploadBytes(") || line.includes("getDownloadURL(")) {
      firebaseStorageOps.push({ file: filePath, line: lineNum, text: line.trim() });
    }

    // Sheets Reads/Writes
    if (line.includes("sheets.spreadsheets.values.get") || line.includes("readSheetData") || line.includes("getSheetValues")) {
      sheetsReads.push({ file: filePath, line: lineNum, text: line.trim() });
    }
    if (line.includes("sheets.spreadsheets.values.append") || line.includes("sheets.spreadsheets.values.update") || line.includes("writeSheetData") || line.includes("appendSheetRow")) {
      sheetsWrites.push({ file: filePath, line: lineNum, text: line.trim() });
    }

    // Drive Reads/Writes
    if (line.includes("drive.files.get") || line.includes("drive.files.list") || line.includes("readDriveFile")) {
      driveReads.push({ file: filePath, line: lineNum, text: line.trim() });
    }
    if (line.includes("drive.files.create") || line.includes("uploadToDrive")) {
      driveWrites.push({ file: filePath, line: lineNum, text: line.trim() });
    }

    // Realtime SSE
    if (line.includes("EventSource(") || line.includes("broadcaster.broadcast") || line.includes("ReadableStream")) {
      realtimeSseOps.push({ file: filePath, line: lineNum, text: line.trim() });
    }
  });
});

console.log("=== FIRESTORE READS (" + firestoreReads.length + ") ===");
firestoreReads.forEach(r => console.log(`- ${r.file}:${r.line} | ${r.text}`));

console.log("\n=== FIRESTORE WRITES (" + firestoreWrites.length + ") ===");
firestoreWrites.forEach(w => console.log(`- ${w.file}:${w.line} | ${w.text}`));

console.log("\n=== FIRESTORE LISTENERS (" + firestoreListeners.length + ") ===");
firestoreListeners.forEach(l => console.log(`- ${l.file}:${l.line} | ${l.text}`));

console.log("\n=== FIREBASE STORAGE (" + firebaseStorageOps.length + ") ===");
firebaseStorageOps.forEach(s => console.log(`- ${s.file}:${s.line} | ${s.text}`));

console.log("\n=== SHEETS READS (" + sheetsReads.length + ") ===");
sheetsReads.forEach(sr => console.log(`- ${sr.file}:${sr.line} | ${sr.text}`));

console.log("\n=== SHEETS WRITES (" + sheetsWrites.length + ") ===");
sheetsWrites.forEach(sw => console.log(`- ${sw.file}:${sw.line} | ${sw.text}`));

console.log("\n=== DRIVE READS (" + driveReads.length + ") ===");
driveReads.forEach(dr => console.log(`- ${dr.file}:${dr.line} | ${dr.text}`));

console.log("\n=== DRIVE WRITES (" + driveWrites.length + ") ===");
driveWrites.forEach(dw => console.log(`- ${dw.file}:${dw.line} | ${dw.text}`));

console.log("\n=== REALTIME SSE (" + realtimeSseOps.length + ") ===");
realtimeSseOps.forEach(se => console.log(`- ${se.file}:${se.line} | ${se.text}`));
