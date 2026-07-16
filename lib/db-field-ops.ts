import { db } from "./firebase";
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy,
  limit
} from "firebase/firestore";

// --------------------------------------------------------
// IDENTITY: FIELD AGENTS
// --------------------------------------------------------
export interface FieldAgent {
  id: string; // FA-YYYY-XXXXXX
  firebaseUid?: string; // Link to Firebase Auth
  name: string;
  email: string;
  phone: string;
  
  // Location
  country: string;
  state: string;
  district: string;
  city: string;
  address: string;

  // Organizational
  role: string; // e.g., "Volunteer", "Field Officer", "Imam"
  region: string; // Assigned operational region
  status: "Active" | "Suspended" | "Archived";
  assignedSupervisor?: string; // Admin who reviews their reports
  
  // Profile
  avatarUrl?: string;
  joinDate: string;

  // Security
  requirePasswordChange: boolean;
  rawPassword?: string;

  // Permissions
  permissions: {
    submitReports: boolean;
    uploadEvidence: boolean;
    viewOwnReports: boolean;
    replyConversations: boolean;
    receiveNotifications: boolean;
  };
  
  // System Statistics
  stats: {
    reportsSubmitted: number;
    reportsApproved: number;
    reportsPending: number;
    reportsRejected: number;
  };
}

// --------------------------------------------------------
// ORIGIN ENTITY: FIELD REPORT (Field Need)
// --------------------------------------------------------
export interface FieldReport {
  id: string; // FR-YYYY-XXXXXX
  agentId: string; // The FA- ID of the submitter
  agentName: string;
  
  // Basic Information
  category: string; // e.g., "Masjid Repair", "Medical Emergency", "Water Well"
  title: string;
  description: string;
  urgency: "Low" | "Medium" | "High";
  estimatedBudget: string; // e.g., "₹45,000"
  
  // Location
  location: {
    country: string;
    state: string;
    district: string;
    village: string;
    gps?: { lat: number; lng: number };
  };
  
  // Beneficiaries
  beneficiaries: {
    families: number;
    children: number;
    women: number;
    elderly: number;
    description: string;
  };
  
  // Evidence
  media: string[]; // URLs to Images/Videos
  documents?: { name: string; url: string; size: string; date: string }[];
  
  // Lifecycle Status
  status: "Pending Review" | "Under Review" | "Needs Info" | "Scheduled" | "Approved" | "Rejected" | "Converted";
  
  // Verification details
  assignedAdminId?: string;
  adminNotes?: string;
  
  // Traceability
  convertedCauseId?: string; // Link to the Official Cause once published
  
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------
// CONVERSATION SYSTEM
// --------------------------------------------------------
export interface FieldConversation {
  id: string; // CONV-YYYY-XXXXXX
  type: "Report" | "Operations";
  agentId: string;
  assignedAdminId?: string;
  reportId?: string; // Optional: only if type is "Report"
  
  lastMessage: {
    text: string;
    timestamp: string;
    senderRole: "Admin" | "Agent" | "System";
  };
  
  unreadCountAdmin: number;
  unreadCountAgent: number;
  
  status: "Waiting For Admin" | "Waiting For Field Agent" | "Resolved";
  isUrgent: boolean;
  
  createdAt: string;
  updatedAt: string;
}

export interface FieldMessage {
  id: string;
  conversationId: string; // Links back to FieldConversation
  reportId?: string; // Legacy support / Optional direct link
  
  senderId: string; // FA- ID or Admin ID or "System"
  senderRole: "Admin" | "Agent" | "System";
  senderName: string;
  text: string;
  
  // Attachments
  isMedia?: boolean;
  mediaBase64?: string;
  isImage?: boolean;
  mediaType?: string;
  mediaName?: string;
  mediaUrls?: string[];
  documentUrls?: { name: string; url: string; size?: string }[];
  
  readByAdmin?: boolean;
  readByAgent?: boolean;
  timestamp: string;
}

// --------------------------------------------------------
// ACTIVITY TRAIL (Audit Log)
// --------------------------------------------------------
export interface FieldActivity {
  id: string; // ACT-YYYY-XXXXXX
  reportId?: string;
  agentId?: string;
  
  action: string; // e.g., "Report Submitted", "Status Changed to Approved", "Evidence Uploaded"
  performedBy: string; // Name/ID of the person or "System"
  timestamp: string;
  
  details?: {
    previousValue?: string;
    newValue?: string;
    reason?: string;
  };
}

// --------------------------------------------------------
// NOTIFICATIONS & ASSIGNMENTS
// --------------------------------------------------------
export interface FieldNotification {
  id: string;
  agentId: string;
  title: string;
  message: string;
  type: "Info" | "Alert" | "Success" | "Assignment";
  isRead: boolean;
  timestamp: string;
  relatedReportId?: string;
}

export interface FieldAssignment {
  id: string;
  agentId: string;
  reportId: string;
  assignedBy: string; // Admin ID
  status: "Pending" | "Accepted" | "Completed";
  notes: string;
  assignedAt: string;
}

// --------------------------------------------------------
// HELPER: GET SERIAL
// --------------------------------------------------------
export async function getNextFieldSerial(collectionName: string, prefix: string): Promise<string> {
  try {
    const snap = await getDocs(query(collection(db, collectionName), orderBy("createdAt", "desc"), limit(1)));
    const year = new Date().getFullYear();
    if (snap.empty) {
      return `${prefix}-${year}-000001`;
    }
    const lastId = snap.docs[0].id; // e.g. FA-2026-000045
    const parts = lastId.split("-");
    const sequence = parts.length === 3 ? parseInt(parts[2], 10) + 1 : 1;
    return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
  } catch (err) {
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-2026-${rand}`;
  }
}
