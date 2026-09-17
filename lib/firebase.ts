import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDf_6iUEtZQ6FRpg42QeDk5eakeHm4XhG8",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "daaraynorg-9165c.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "daaraynorg-9165c",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "daaraynorg-9165c.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "269969400623",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:269969400623:web:bdb5613251e7524018b7da",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-WWSBERD2KZ",
};

const isFirebaseConfigValid = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

// Initialize Firebase App only if valid configuration is present
let app: any = null;
let auth: any = null;
let storage: any = null;
let analytics: any = null;

// NOTE: Firestore (db) is intentionally NOT initialized here.
// Architecture: Firebase = Authentication + Storage ONLY.
// All operational business data lives in Google Sheets (via lib/repositories).
const db: any = null;

if (isFirebaseConfigValid) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

    try {
      auth = getAuth(app);
    } catch (authErr) {
      console.warn("[Firebase] Auth initialization failed:", authErr);
      auth = null;
    }

    try {
      storage = getStorage(app);
    } catch (storageErr) {
      console.warn("[Firebase] Storage initialization failed:", storageErr);
      storage = null;
    }

    if (typeof window !== "undefined" && firebaseConfig.measurementId && !firebaseConfig.measurementId.includes("dummy") && !firebaseConfig.measurementId.includes("your_firebase")) {
      isSupported().then((supported) => {
        if (supported) {
          try {
            analytics = getAnalytics(app);
          } catch (e) {}
        }
      });
    }
  } catch (initErr) {
    console.warn("[Firebase] Initialization skipped due to config error:", initErr);
  }
} else {
  console.info("[Firebase] Placeholder or dummy credentials detected. Firebase services running in fallback/mock mode.");
}

// Firestore collection references are removed — business data is in Google Sheets.
// Kept as an empty object for backwards-compatibility with any import that references `collections`.
export const collections = {} as const;

export { app, db, auth, storage, analytics };
