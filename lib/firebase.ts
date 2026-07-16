import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, CollectionReference, DocumentData } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase App without duplicating
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize services
const db = getFirestore(app);

// Auth initialization may fail with mock API keys in test environments.
// We wrap it to allow the module to load safely; auth will be null in those cases.
let auth: ReturnType<typeof getAuth>;
try {
  auth = getAuth(app);
} catch (authInitError) {
  if (process.env.NODE_ENV === "test" || process.env.AI_PROVIDER === "mock") {
    console.warn("[Firebase] Auth initialization skipped in test/mock environment.");
    auth = null as any; // Safe null coercion — only happens in test env, never used for real auth
  } else {
    throw authInitError;
  }
}

const storage = getStorage(app);

// Client-only Analytics
let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

// Preparation of Firestore collections for future development
const createCollectionRef = <T = DocumentData>(collectionName: string) => {
  return collection(db, collectionName) as CollectionReference<T>;
};

export const collections = {
  donations: createCollectionRef("donations"),
  beneficiaries: createCollectionRef("beneficiaries"),
  programs: createCollectionRef("programs"),
  volunteers: createCollectionRef("volunteers"),
  campaigns: createCollectionRef("campaigns"),
  news: createCollectionRef("news"),
  events: createCollectionRef("events"),
  gallery: createCollectionRef("gallery"),
  publicLedger: createCollectionRef("publicLedger"),
  users: createCollectionRef("users"),
  admins: createCollectionRef("admins"),
  settings: createCollectionRef("settings"),
  contactMessages: createCollectionRef("contactMessages"),
  newsletterSubscribers: createCollectionRef("newsletterSubscribers"),
  testimonials: createCollectionRef("testimonials"),
  faq: createCollectionRef("faq"),
};

export { app, db, auth, storage, analytics };
