const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

// Load environment variables
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env.local') });

// Flag to fallback to local JSON database / uploads if Firebase is offline or disabled
// Once set to true it stays true for the entire process lifetime — no more retry overhead
let useLocalFallback = false;

// In-memory ledger cache — avoids hitting disk/Firestore on every GET /api/ledger
let ledgerCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10_000; // 10 s — fresh enough, yet instant for repeat reads

function invalidateCache() {
  ledgerCache = null;
  cacheTimestamp = 0;
}

// Promise timeout wrapper
// Reduced default timeout: Firebase is already known-disabled — fail fast
function withTimeout(promise, timeoutMs = 600) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout: Firebase operation took too long."));
    }, timeoutMs);
    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Initialize Firebase client SDK
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc } = require('firebase/firestore');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let db, storage;
try {
  const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(firebaseApp);
  storage = getStorage(firebaseApp);
} catch (err) {
  console.warn("Failed to initialize Firebase SDK. Falling back to local storage:", err.message);
  useLocalFallback = true;
}

const app = express();

// ── Performance middleware ──────────────────────────────────────────────────
// Gzip compress all text responses (HTML, JSON, CSS, JS) — typical 70-80% size reduction
app.use(compression());
// Cache static assets aggressively; HTML/API remain dynamic
app.use((req, res, next) => {
  if (/\.(png|jpg|jpeg|gif|webp|ico|woff2|woff|ttf)$/i.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (/\.(css|js)$/i.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  next();
});
const PORT = process.env.PORT || 8000;

// Setup directories
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const dbPath = path.join(dataDir, 'ledger.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage setup for screenshots
const localMulterStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: localMulterStorage });

// Parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static UI assets
app.use(express.static(path.join(__dirname, 'public')));
// Serve static uploads
app.use('/uploads', express.static(uploadsDir));

// Function to migrate local ledger.json data to Firestore if Firestore is empty
async function migrateLedgerToFirestore() {
  if (useLocalFallback) return;
  try {
    const snapshot = await withTimeout(getDocs(collection(db, 'publicLedger')), 1500);
    if (snapshot.empty && fs.existsSync(dbPath)) {
      console.log("Firestore publicLedger is empty. Starting migration of local ledger.json data...");
      const data = fs.readFileSync(dbPath, 'utf8');
      const ledger = JSON.parse(data);
      for (const item of ledger) {
        const docRef = doc(db, 'publicLedger', item.id);
        const { id, ...fields } = item;
        await withTimeout(setDoc(docRef, {
          ...fields,
          createdAt: fields.createdAt || new Date().toISOString()
        }), 1000);
      }
      console.log(`Successfully migrated ${ledger.length} items to Firestore.`);
    }
  } catch (error) {
    console.warn("Migration to Firestore failed (permanent local fallback):", error.message || error);
    useLocalFallback = true; // permanent — no more Firebase retries this session
  }
}

/* ====================================================
   ROUTE HANDLING (Clean URLs without .html extensions)
   ==================================================== */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

/* ====================================================
   API ENDPOINTS
   ==================================================== */

// Helper to fetch ledger from local ledger.json
function getLocalLedger() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
  }
  const data = fs.readFileSync(dbPath, 'utf8');
  return JSON.parse(data);
}

// 1. Fetch Ledger Entries — with in-memory cache
app.get('/api/ledger', async (req, res) => {
  // Serve from memory cache if fresh
  const now = Date.now();
  if (ledgerCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(ledgerCache);
  }

  let ledger;

  if (!useLocalFallback) {
    try {
      const snapshot = await withTimeout(getDocs(collection(db, 'publicLedger')));
      ledger = [];
      snapshot.forEach(d => ledger.push({ id: d.id, ...d.data() }));
      ledger.sort((a, b) => b.id.localeCompare(a.id));
    } catch (error) {
      console.warn("Firestore read failed → permanent local fallback:", error.message || error);
      useLocalFallback = true;
    }
  }

  if (!ledger) {
    try {
      ledger = getLocalLedger();
    } catch (error) {
      console.error("Local database read error:", error);
      return res.status(500).json({ error: "Failed to read contribution ledger." });
    }
  }

  // Store in cache
  ledgerCache = ledger;
  cacheTimestamp = now;
  res.setHeader('X-Cache', 'MISS');
  res.json(ledger);
});

// 2. Submit Donation
app.post('/api/donate', upload.single('screenshot'), async (req, res) => {
  try {
    const { donorName, donorContact, upiRef, amount, currency, cause } = req.body;
    
    if (!upiRef || !amount) {
      return res.status(400).json({ error: "Required fields (Amount, UPI Ref Code) are missing." });
    }

    // Generate unique sequential Tracking ID
    let trackingId;
    let nextIdx;
    
    if (!useLocalFallback) {
      try {
        const snapshot = await withTimeout(getDocs(collection(db, 'publicLedger')), 1500);
        nextIdx = snapshot.size + 1;
      } catch (err) {
        console.warn("Firestore fetch size failed, using local size:", err.message);
        if (err.message && err.message.includes("Timeout")) {
          useLocalFallback = true;
        }
        const localLedger = getLocalLedger();
        nextIdx = localLedger.length + 1;
      }
    } else {
      const localLedger = getLocalLedger();
      nextIdx = localLedger.length + 1;
    }
    trackingId = 'DA' + String(nextIdx).padStart(3, '0');

    // Calculate splits
    const numAmount = parseInt(amount, 10);
    const directAid = Math.floor(numAmount * 0.9);
    const opsCost = Math.floor(numAmount * 0.1);

    // Format donor name
    const finalDonor = (donorName && donorName.trim()) ? `${donorName.trim()} (UPI)` : "Anonymous (UPI)";

    // Proof file check & upload
    let proofText = "⏳ Awaiting bank check";
    let proofUrl = null;
    if (req.file) {
      if (!useLocalFallback) {
        try {
          const fileBuffer = fs.readFileSync(req.file.path);
          const storageRef = ref(storage, 'proofs/' + req.file.filename);
          const uploadResult = await withTimeout(uploadBytes(storageRef, fileBuffer, {
            contentType: req.file.mimetype
          }), 2000);
          proofUrl = await withTimeout(getDownloadURL(uploadResult.ref), 1500);
          proofText = "⏳ Proof Uploaded (Check)";

          // Delete the temporary file from local disk
          fs.unlinkSync(req.file.path);
        } catch (uploadError) {
          console.warn("Firebase Storage upload error, falling back to local:", uploadError.message);
          if (uploadError.message && uploadError.message.includes("Timeout")) {
            useLocalFallback = true;
          }
          proofUrl = `/uploads/${req.file.filename}`;
          proofText = "⏳ Proof Uploaded (Local Fallback)";
        }
      } else {
        proofUrl = `/uploads/${req.file.filename}`;
        proofText = "⏳ Proof Uploaded (Check)";
      }
    }

    // Format current date
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const newRecord = {
      donor: finalDonor,
      cause: cause || "General Support",
      amount: numAmount,
      directAid: directAid,
      status: "pending",
      date: formattedDate,
      refCode: upiRef,
      opsCost: opsCost,
      proof: proofText,
      proofUrl: proofUrl,
      createdAt: new Date().toISOString()
    };

    if (!useLocalFallback) {
      try {
        // Save to Firestore using trackingId as document ID
        await withTimeout(setDoc(doc(db, 'publicLedger', trackingId), newRecord), 1500);
      } catch (firestoreErr) {
        console.warn("Firestore save failed, saving to local json instead:", firestoreErr.message);
        if (firestoreErr.message && firestoreErr.message.includes("Timeout")) {
          useLocalFallback = true;
        }
        const localLedger = getLocalLedger();
        localLedger.unshift({ id: trackingId, ...newRecord });
        fs.writeFileSync(dbPath, JSON.stringify(localLedger, null, 2));
      }
    } else {
      const localLedger = getLocalLedger();
      localLedger.unshift({ id: trackingId, ...newRecord });
      fs.writeFileSync(dbPath, JSON.stringify(localLedger, null, 2));
    }

    // Bust the ledger cache so the next GET reflects this new record immediately
    invalidateCache();

    res.json({ success: true, trackingId: trackingId });
  } catch (error) {
    console.error("Error saving contribution:", error);
    res.status(500).json({ error: "Failed to process contribution submission." });
  }
});

app.listen(PORT, () => {
  console.log(`Daarayn Aid server running at http://localhost:${PORT}`);
  migrateLedgerToFirestore();
});



