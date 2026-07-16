import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const targetCauses = [
  { id: "family-relief-bundle", name: "Family Relief Bundle", category: "Relief", goalAmount: 500000 },
  { id: "orphan-care-sponsor", name: "Orphan Care Sponsor", category: "Orphan Care", goalAmount: 800000 },
  { id: "masjid-al-noor-const", name: "Masjid Al-Noor Const", category: "Community", goalAmount: 2500000 },
  { id: "sheikh-arham-sponsorship", name: "Sheikh Arham Sponsorship", category: "Education", goalAmount: 300000 },
];

async function seedCauses() {
  console.log("Clearing existing causes...");
  const snap = await getDocs(collection(db, "causes"));
  for (const docSnap of snap.docs) {
    await deleteDoc(doc(db, "causes", docSnap.id));
  }
  
  console.log("Seeding new target causes...");
  for (const cause of targetCauses) {
    try {
      const causeData = {
        name: cause.name,
        slug: cause.id,
        description: `Support for ${cause.name}`,
        category: cause.category,
        goalAmount: cause.goalAmount,
        raisedAmount: 0,
        status: "active",
        visibility: "public",
        featured: true,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "causes", cause.id), causeData);
      console.log(`Successfully seeded: ${cause.name}`);
    } catch (err) {
      console.error(`Failed to seed ${cause.name}:`, err);
    }
  }
  console.log("Seeding complete!");
  process.exit(0);
}

seedCauses();
