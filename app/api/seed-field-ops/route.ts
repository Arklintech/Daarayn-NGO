import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';

export async function GET() {
  try {
    const batch = writeBatch(db);
    const year = new Date().getFullYear();

    const dummyNames = ["Anas", "Misri", "Ifzal", "Mastan", "Ali", "Rehan", "Khan"];
    const roles = ["Volunteer", "Field Officer", "Imam", "Coordinator"];
    const districts = ["Hyderabad", "Karimnagar", "Nizamabad", "Warangal", "Medak"];
    
    for (let i = 0; i < dummyNames.length; i++) {
      const name = dummyNames[i];
      const agentId = `FA-${year}-${String(100 + i).padStart(6, '0')}`;
      
      // 1. Create Agent
      const agentRef = doc(collection(db, "field_agents"), agentId);
      batch.set(agentRef, {
        id: agentId,
        name: name,
        email: `${name.toLowerCase()}@daarayn.org`,
        phone: `+91 ${9000000000 + i * 1234567}`,
        country: "India",
        state: "Telangana",
        district: districts[i % districts.length],
        city: districts[i % districts.length],
        address: `${name} Manzil, ${districts[i % districts.length]}`,
        role: roles[i % roles.length],
        region: "South India",
        status: i % 4 === 0 ? "Suspended" : "Active",
        joinDate: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
        requirePasswordChange: false,
        permissions: {
          submitReports: true,
          uploadEvidence: true,
          viewOwnReports: true,
          replyConversations: true,
          receiveNotifications: true,
        },
        stats: {
          reportsSubmitted: i * 2,
          reportsApproved: i,
          reportsPending: i > 0 ? 1 : 0,
          reportsRejected: 0,
        }
      });

      // 2. Create Dummy Reports for this Agent (if they have submitted reports)
      if (i > 0) { // First agent (Anas) will have 0 reports to show empty state
        const reportId = `FR-${year}-${String(1000 + i).padStart(6, '0')}`;
        const reportRef = doc(collection(db, "field_reports"), reportId);
        
        batch.set(reportRef, {
          id: reportId,
          agentId: agentId,
          agentName: name,
          category: ["Masjid Repair", "Medical Emergency", "Water Well", "Orphan Support"][i % 4],
          title: `Urgent Needs Assessment in ${districts[i % districts.length]}`,
          description: `Detailed assessment carried out by ${name}. Immediate intervention requested for local beneficiaries facing severe hardships.`,
          urgency: ["Low", "Medium", "High"][i % 3],
          estimatedBudget: `₹${(i + 1) * 25000}`,
          location: {
            country: "India",
            state: "Telangana",
            district: districts[i % districts.length],
            village: `${districts[i % districts.length]} Rural`,
          },
          beneficiaries: {
            families: (i * 10) + 5,
            children: (i * 20) + 10,
            women: (i * 15) + 5,
            elderly: (i * 5) + 2,
            description: "Marginalized local community members."
          },
          media: [
            "https://images.unsplash.com/photo-1548048026-5a1a941d93d3?q=80&w=400",
            "https://images.unsplash.com/photo-1584282534571-042858cdbb4a?q=80&w=400"
          ],
          status: i % 2 === 0 ? "Pending Review" : "Approved",
          createdAt: new Date(Date.now() - Math.random() * 1000000000).toISOString(),
          updatedAt: new Date().toISOString()
        });

        // 3. Create Dummy Messages for the Report
        const msg1Ref = doc(collection(db, "field_messages"));
        batch.set(msg1Ref, {
          id: msg1Ref.id,
          reportId: reportId,
          senderId: agentId,
          senderRole: "Agent",
          senderName: name,
          text: `Assalamu Alaikum, I have submitted the report for ${districts[i % districts.length]}. Please review.`,
          timestamp: new Date(Date.now() - 5000000).toISOString()
        });

        const msg2Ref = doc(collection(db, "field_messages"));
        batch.set(msg2Ref, {
          id: msg2Ref.id,
          reportId: reportId,
          senderId: "Admin_1",
          senderRole: "Admin",
          senderName: "Ahmed Khan",
          text: `Wa Alaikum Assalam ${name}. I will review this shortly. Could you confirm the exact beneficiary count?`,
          timestamp: new Date(Date.now() - 3000000).toISOString()
        });
      }
    }

    await batch.commit();

    return NextResponse.json({ message: "Dummy agents, reports, and conversations seeded successfully!" }, { status: 200 });
  } catch (error: any) {
    console.error("Error seeding field ops data:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
