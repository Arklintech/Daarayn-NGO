import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, writeBatch } from 'firebase/firestore';
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

const causes = [
  "family-relief-bundle",
  "orphan-care-sponsor",
  "masjid-al-noor-const",
  "sheikh-arham-sponsorship"
];

const mockNames = ["Ahmed Ali", "Sarah M", "Anonymous", "Mohammed K", "Fatima Z", "Usman T", "Aisha R", "Omar H", "Zainab B", "Hassan Q"];
const methods = ["UPI", "Card", "Bank Transfer"];

async function mockDonations() {
  const batch = writeBatch(db);
  let totalAdded = 0;

  for (const cause of causes) {
    // Generate 5-15 random donations per cause
    const numDonations = Math.floor(Math.random() * 11) + 5;
    for (let i = 0; i < numDonations; i++) {
      const donationId = `MOCK_${cause}_${i}_${Date.now()}`;
      const amount = Math.floor(Math.random() * 50000) + 1000;
      
      const docRef = doc(db, "donations", donationId);
      batch.set(docRef, {
        id: donationId,
        donorName: mockNames[Math.floor(Math.random() * mockNames.length)],
        donorId: `donor_${Math.floor(Math.random() * 1000)}`,
        email: "mock@example.com",
        phone: "1234567890",
        date: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString(),
        paymentMethod: methods[Math.floor(Math.random() * methods.length)],
        status: "completed",
        anonymous: Math.random() > 0.8,
        selectedCauses: [
          {
            causeId: cause,
            allocatedAmount: amount
          }
        ]
      });
      totalAdded++;
    }
  }

  await batch.commit();
  console.log(`Successfully added ${totalAdded} mock donations to light up the dashboard!`);
  process.exit(0);
}

mockDonations();
