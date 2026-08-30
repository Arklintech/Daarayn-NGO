import { db } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";

async function checkCauses() {
  try {
    const snap = await getDocs(collection(db, "causes"));
    console.log(`Total causes in Firestore: ${snap.size}`);
    snap.forEach(d => {
      const data = d.data();
      console.log(`ID: "${d.id}" | name: "${data.name}" | status: "${data.status}" | title: "${data.title}" | category: "${data.category}"`);
    });
  } catch (err) {
    console.error("Error fetching causes:", err);
  }
}

checkCauses();
