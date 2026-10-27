import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, doc, setDoc } from 'firebase/firestore';
import { config } from 'dotenv';
config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test recipients come from the environment (comma-separated TEST_RECIPIENTS); never hardcode personal addresses.
const targetEmails = (process.env.TEST_RECIPIENTS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (targetEmails.length === 0) { console.error("Set TEST_RECIPIENTS to your own test inboxes."); process.exit(1); }

async function seed() {
  console.log("Fetching causes...");
  const causesSnap = await getDocs(collection(db, "causes"));
  if (causesSnap.empty) {
    console.log("No causes found! Create a cause first.");
    process.exit(1);
  }
  
  const targetCause = causesSnap.docs[0];
  console.log(`Using Cause: ${targetCause.data().name} (${targetCause.id})`);

  for (const email of targetEmails) {
    const donorId = `test_donor_${email.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    // Create or update Donor
    await setDoc(doc(db, "donors", donorId), {
      email,
      name: `Test Donor ${email.split('@')[0]}`,
      createdAt: new Date().toISOString()
    }, { merge: true });
    
    // Create a completed donation for this cause
    await addDoc(collection(db, "donations"), {
      donorId,
      donorEmail: email,
      donorName: `Test Donor ${email.split('@')[0]}`,
      amount: 100,
      status: "completed",
      selectedCauses: [{ causeId: targetCause.id, allocatedAmount: 100 }],
      createdAt: new Date().toISOString()
    });
    
    console.log(`Seeded donor & donation for ${email}`);
  }
  
  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch(console.error);
