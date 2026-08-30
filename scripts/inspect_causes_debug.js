const { db } = require("./lib/firebase");
const { collection, getDocs } = require("firebase/firestore");

async function checkCauses() {
  try {
    const snap = await getDocs(collection(db, "causes"));
    console.log(`Total causes in Firestore: ${snap.size}`);
    snap.forEach(d => {
      console.log(`ID: ${d.id} | Name: "${d.data().name}" | Status: "${d.data().status}" | Title: "${d.data().title}" | Category: "${d.data().category}"`);
    });
  } catch (err) {
    console.error("Error fetching causes:", err);
  }
}

checkCauses();
