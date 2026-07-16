"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analytics = exports.storage = exports.auth = exports.db = exports.app = exports.collections = void 0;
const app_1 = require("firebase/app");
const firestore_1 = require("firebase/firestore");
const auth_1 = require("firebase/auth");
const storage_1 = require("firebase/storage");
const analytics_1 = require("firebase/analytics");
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
const app = (0, app_1.getApps)().length === 0 ? (0, app_1.initializeApp)(firebaseConfig) : (0, app_1.getApp)();
exports.app = app;
// Initialize services
const db = (0, firestore_1.getFirestore)(app);
exports.db = db;
const auth = (0, auth_1.getAuth)(app);
exports.auth = auth;
const storage = (0, storage_1.getStorage)(app);
exports.storage = storage;
// Client-only Analytics
let analytics = null;
exports.analytics = analytics;
if (typeof window !== "undefined") {
    (0, analytics_1.isSupported)().then((supported) => {
        if (supported) {
            exports.analytics = analytics = (0, analytics_1.getAnalytics)(app);
        }
    });
}
// Preparation of Firestore collections for future development
const createCollectionRef = (collectionName) => {
    return (0, firestore_1.collection)(db, collectionName);
};
exports.collections = {
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
