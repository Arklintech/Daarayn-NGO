'use client';

import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { collection, getDocs } from "firebase/firestore";
import { 
  Sparkles, 
  Send, 
  RefreshCw, 
  CheckCircle2, 
  FileText, 
  TrendingUp, 
  ShieldCheck, 
  FileSpreadsheet, 
  Briefcase, 
  Layers,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeMominRole } from "@/lib/ai/roleNormalizer";

const COLORS = ["#D4AF37", "#10B981", "#3B82F6", "#EF4444"];

// ─── Enterprise Markdown Renderer ──────────────────────────────────────────────
// Preprocesses GitHub-style alert syntax before react-markdown sees it.
// Uses string-level preprocessing — the only reliable approach for GFM alerts.
type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

const ALERT_STYLES: Record<AlertType, string> = {
  NOTE:      'bg-blue-900/20 border-blue-500/30 text-blue-200',
  TIP:       'bg-emerald-900/20 border-emerald-500/30 text-emerald-200',
  IMPORTANT: 'bg-luxury-ivory/10 border-luxury-ivory/30 text-luxury-ivory shadow-[0_0_15px_rgba(212,175,55,0.05)]',
  WARNING:   'bg-amber-900/20 border-amber-500/30 text-amber-200',
  CAUTION:   'bg-red-900/20 border-red-500/30 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.1)]',
};

const ALERT_ICONS: Record<AlertType, string> = {
  NOTE: '📋', TIP: '✅', IMPORTANT: '⚡', WARNING: '⚠️', CAUTION: '🚨',
};

const ALERT_LABELS: Record<AlertType, string> = {
  NOTE: 'SYSTEM NOTE', TIP: 'VERIFIED', IMPORTANT: 'ERCE CERTIFIED', WARNING: 'ADVISORY', CAUTION: 'REJECTED',
};

function MominMarkdown({ content }: { content: string }) {
  // Parse the content into segments: either a GFM alert block or regular markdown
  const segments: Array<{ type: 'alert'; alertType: AlertType; lines: string[] } | { type: 'markdown'; text: string }> = [];

  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const alertMatch = lines[i].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/);
    if (alertMatch) {
      const alertType = alertMatch[1] as AlertType;
      const alertLines: string[] = [];
      i++;
      // Collect continuation lines (starting with ">")
      while (i < lines.length && lines[i].startsWith('>')) {
        alertLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      segments.push({ type: 'alert', alertType, lines: alertLines });
    } else {
      // Regular markdown — collect until next alert block
      const mdLines: string[] = [];
      while (i < lines.length && !lines[i].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/)) {
        mdLines.push(lines[i]);
        i++;
      }
      if (mdLines.join('\n').trim()) {
        segments.push({ type: 'markdown', text: mdLines.join('\n') });
      }
    }
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, idx) => {
        if (seg.type === 'alert') {
          const styles = ALERT_STYLES[seg.alertType];
          const icon = ALERT_ICONS[seg.alertType];
          const label = ALERT_LABELS[seg.alertType];
          return (
            <div key={idx} className={`p-4 rounded-xl border ${styles} font-mono text-[11px] leading-relaxed`}>
              <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest opacity-70">
                <span>{icon}</span>
                <span>{label}</span>
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {seg.lines.join('\n')}
              </ReactMarkdown>
            </div>
          );
        } else {
          return (
            <div key={idx} className="prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:text-luxury-ivory prose-headings:font-bold prose-a:text-blue-400 prose-ul:list-disc prose-ol:list-decimal prose-li:text-gray-300 prose-strong:text-white prose-code:text-emerald-300 prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-hr:border-white/10">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table({node, ...props}) {
                    return <div className="overflow-x-auto my-4 rounded-lg border border-white/10"><table className="w-full text-left border-collapse bg-white/[0.01]" {...props} /></div>;
                  },
                  th({node, ...props}) {
                    return <th className="border-b border-white/10 p-3 text-luxury-ivory font-bold text-[10px] uppercase tracking-widest bg-black/40" {...props} />;
                  },
                  td({node, ...props}) {
                    return <td className="border-b border-white/5 p-3 text-gray-300 text-[12px]" {...props} />;
                  },
                  h3({node, ...props}) {
                    return <h3 className="text-[13px] font-bold text-luxury-ivory uppercase tracking-widest mt-4 mb-2 border-b border-white/5 pb-1" {...props} />;
                  },
                  h4({node, ...props}) {
                    return <h4 className="text-[12px] font-bold text-white/80 mt-3 mb-1.5" {...props} />;
                  },
                  li({node, ...props}) {
                    return <li className="text-gray-300 text-[13px] leading-relaxed" {...props} />;
                  },
                  p({node, ...props}) {
                    return <p className="text-gray-200 text-[13px] leading-relaxed mb-2" {...props} />;
                  },
                  strong({node, ...props}) {
                    return <strong className="text-white font-semibold" {...props} />;
                  },
                  code({node, className, children, ...props}) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !match ? (
                      <code className="bg-white/10 text-emerald-300 px-1.5 py-0.5 rounded text-[11px] font-mono" {...props}>{children}</code>
                    ) : (
                      <code className="block bg-black p-4 rounded-xl overflow-x-auto text-[11px] font-mono border border-white/10 my-4" {...props}>{children}</code>
                    );
                  }
                }}
              >
                {seg.text}
              </ReactMarkdown>
            </div>
          );
        }
      })}
    </div>
  );
}

export default function AIDashboard() {
  const { user, adminData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  
  // Data lists — typed as generic records since Firestore schemas are flexible
  type FirestoreRecord = Record<string, unknown>;
  const [drafts, setDrafts] = useState<FirestoreRecord[]>([]);
  const [stats, setStats] = useState<FirestoreRecord | null>(null);
  const [donors, setDonors] = useState<FirestoreRecord[]>([]);
  const [donations, setDonations] = useState<FirestoreRecord[]>([]);
  const [programs, setPrograms] = useState<FirestoreRecord[]>([]);
  const [communications, setCommunications] = useState<FirestoreRecord[]>([]);

  // Selected Draft for inline editor
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<FirestoreRecord | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  // Chat message type
  interface MessageMetadata {
    responseMode?: "INFORMATION" | "CREATION" | "WORKFLOW" | "AUDIT" | string;
    responseDepth?: string;
    allowedComponents?: string[];
    requestId?: string;
    status?: string;
    confidence?: number;
    certification?: string;
    developerDiagnostics?: { responseTimeMs?: string | number };
    [key: string]: unknown; // allow additional fields from API
  }

  interface CopilotMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    references?: Array<{ source: string; content: string }>;
    metadata?: MessageMetadata;
    actionPlan?: { planName: string; reasoning: string; isPlanValid?: boolean; actions: Array<{ type: string; description: string }> };
    workflowPlan?: { workflowId?: string; tasks: Array<{ name: string; status?: string }> };
  }

  // Copilot Chat States
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([
    { 
      id: "welcome", 
      role: "assistant", 
      content: "Assalamu Alaikum. I am MOMIN, the Enterprise Intelligence Operating System for the Daarayn Foundation. Every interaction begins here. What operational query or directive shall we execute?",
      metadata: { responseMode: "INFORMATION", responseDepth: "STANDARD", allowedComponents: [] }
    }
  ]);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotSessionId, setCopilotSessionId] = useState("");
  
  // Track active action plans and workflow plans
  const [activeActionPlan, setActiveActionPlan] = useState<CopilotMessage["actionPlan"] | null>(null);
  const [executingPlan, setExecutingPlan] = useState(false);

  // Expanded sections state per message id: Record<messageId, Record<sectionName, boolean>>
  const [expandedSections, setExpandedSections] = useState<Record<string, Record<string, boolean>>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const adminName = adminData?.name || user?.email?.split("@")[0] || "Administrator";
  const userRole = normalizeMominRole(adminData?.role || "super_admin");

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch AI drafts
      const draftRes = await fetch("/api/admin/ai/drafts");
      const draftData = await draftRes.json();
      if (draftData.success) {
        setDrafts(draftData.drafts);
      }

      // 2. Fetch AI Stats
      const statsRes = await fetch("/api/admin/ai/stats");
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }

      // 3. Fetch databases
      const donorSnap = await getDocs(collection(db, "donors"));
      const donorsList: FirestoreRecord[] = [];
      donorSnap.forEach(d => donorsList.push({ id: d.id, ...d.data() }));
      setDonors(donorsList);

      const donationSnap = await getDocs(collection(db, "donations"));
      const donationsList: FirestoreRecord[] = [];
      donationSnap.forEach(d => donationsList.push({ id: d.id, ...d.data() }));
      setDonations(donationsList);



      const progSnap = await getDocs(collection(db, "programs"));
      const progsList: FirestoreRecord[] = [];
      progSnap.forEach(d => progsList.push({ id: d.id, ...d.data() }));
      setPrograms(progsList);

      try {
        const commSnap = await getDocs(collection(db, "communications"));
        const commsList: FirestoreRecord[] = [];
        commSnap.forEach(d => commsList.push({ id: d.id, ...d.data() }));
        setCommunications(commsList);
      } catch (commErr) {
        console.warn("Failed to load communications collection:", commErr);
      }

      // 4. Fetch Proactive Alerts (Phase 7)
      try {
        const proactiveRes = await fetch("/api/admin/ai/proactive");
        const proactiveData = await proactiveRes.json();
        if (proactiveData.success && proactiveData.alert) {
          // Filter out any existing proactive alert before adding a fresh one
          setCopilotMessages(prev => [
            ...prev.filter(m => !m.id?.startsWith("proactive_alert_")),
            {
              id: `proactive_alert_${Date.now()}`,
              role: "assistant",
              content: proactiveData.alert,
              metadata: { responseMode: "INFORMATION", responseDepth: "STANDARD", allowedComponents: [] }
            }
          ]);
        }
      } catch (err) {
        console.warn("Failed to load proactive alerts:", err);
      }

    } catch (err) {
      console.error("Failed to load MOMIN context data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setCopilotSessionId(`MOMIN-SESS-${Date.now()}`);
  }, []);

  // Scroll to bottom smoothly when user sends a message
  useEffect(() => {
    if (scrollRef.current && copilotLoading) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [copilotMessages.length, copilotLoading]);

  // Toggle sections inline
  const toggleSection = (messageId: string, sectionName: string) => {
    setExpandedSections(prev => {
      const msgSections = prev[messageId] || {};
      return {
        ...prev,
        [messageId]: {
          ...msgSections,
          [sectionName]: !msgSections[sectionName]
        }
      };
    });
  };

  // Chat sender
  const handleSendCopilot = async (text: string) => {
    if (!text.trim() || copilotLoading) return;

    const userMsg: CopilotMessage = { id: `msg-${Date.now()}-user`, role: "user", content: text };
    setCopilotMessages(prev => [...prev, userMsg]);
    setCopilotInput("");
    setCopilotLoading(true);

    try {
      const historyPayload = copilotMessages
        .filter(m => m.id !== "welcome")
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/admin/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          sessionId: copilotSessionId,
          adminEmail: user?.email || "admin@daarayn.org",
          adminRole: userRole
        })
      });

      const data = await response.json();
      if (data.success) {
        const newMsg: CopilotMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: "assistant",
          content: data.reply,
          references: data.references || [],
          metadata: data.metadata || {},
          actionPlan: data.actionPlan || null,
          workflowPlan: data.workflowPlan || null,
        };
        const newMessageId = newMsg.id;

        setCopilotMessages(prev => [...prev, newMsg]);

        // If there's an action plan, auto-track it globally too
        if (data.actionPlan && data.actionPlan.isPlanValid) {
          setActiveActionPlan(data.actionPlan);
        }

        // Auto-expand default sections based on mode
        const mode = data.metadata?.responseMode || "INFORMATION";
        if (mode === "CREATION") {
          // Find any pending draft for this interaction
          const pendingDraft = drafts.find(d => d.status === "pending") || (data.references && data.references[0]);
          if (pendingDraft) {
            setSelectedDraftId(pendingDraft.id || "draft-temp");
            setEditingContent(pendingDraft.payload || { subject: "Daarayn Acknowledgment", body: "Dear donor..." });
          } else {
            setSelectedDraftId("draft-temp");
            setEditingContent({
              subject: data.reply.split("\n")[0] || "Acknowledgment of Donation",
              body: data.reply
            });
          }
          toggleSection(newMessageId, "drafts");
        } else if (mode === "WORKFLOW") {
          toggleSection(newMessageId, "workflowPlan");
        } else if (mode === "AUDIT") {
          toggleSection(newMessageId, "audit");
        }

      } else {
        setCopilotMessages(prev => [...prev, {
          id: `msg-${Date.now()}-assistant`,
          role: "assistant",
          content: "System exception encountered. Operations resolved with failure bounds.",
          metadata: { responseMode: "INFORMATION" }
        }]);
      }
    } catch (error) {
      setCopilotMessages(prev => [...prev, {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: "Error: Could not establish connectivity with MOMIN services.",
        metadata: { responseMode: "INFORMATION" }
      }]);
    } finally {
      setCopilotLoading(false);
    }
  };

  // Draft operations
  const handleSaveChanges = async (draftId: string) => {
    if (!editingContent) return;
    setProcessingAction("edit");
    try {
      const response = await fetch(`/api/admin/ai/drafts/${draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          updatedPayload: editingContent,
          adminEmail: user?.email || "admin@daarayn.org",
        }),
      });
      const data = await response.json();
      if (data.success) {
        setEditSuccess(true);
        await loadData();
        setTimeout(() => setEditSuccess(false), 3000);
      } else {
        alert("Save failed: " + data.error);
      }
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleApprove = async (draftId: string) => {
    setProcessingAction("approve");
    try {
      const response = await fetch(`/api/admin/ai/drafts/${draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          adminEmail: user?.email || "admin@daarayn.org",
        }),
      });
      const data = await response.json();
      if (data.success) {
        alert("Communication approved and dispatched successfully.");
        setSelectedDraftId(null);
        setEditingContent(null);
        await loadData();
      } else {
        alert("Approval failed: " + data.error);
      }
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleReject = async (draftId: string) => {
    if (!confirm("Confirm draft rejection and removal?")) return;
    setProcessingAction("reject");
    try {
      const response = await fetch(`/api/admin/ai/drafts/${draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          adminEmail: user?.email || "admin@daarayn.org",
        }),
      });
      const data = await response.json();
      if (data.success) {
        alert("Draft discarded.");
        setSelectedDraftId(null);
        setEditingContent(null);
        await loadData();
      } else {
        alert("Action failed: " + data.error);
      }
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setProcessingAction(null);
    }
  };

  // Execution Planner
  const handleExecutePlan = async () => {
    if (!activeActionPlan) return;
    setExecutingPlan(true);
    try {
      const response = await fetch("/api/admin/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionPlan: activeActionPlan,
          adminEmail: user?.email || "admin@daarayn.org",
          adminRole: userRole
        })
      });
      const data = await response.json();
      if (data.success) {
        alert("Action Plan executed successfully: " + data.message);
        setActiveActionPlan(null);
        await loadData();
      } else {
        alert("Execution failed: " + data.error);
      }
    } catch (error) {
      alert("Execution error: " + (error as Error).message);
    } finally {
      setExecutingPlan(false);
    }
  };


  const complianceHealth = donations.filter((d: { receiptUrl?: string }) => !d.receiptUrl).length === 0 ? "100% Verified" : `${donations.filter((d: { receiptUrl?: string }) => !d.receiptUrl).length} Pending`;

  interface StatsRecord { todayDrafts?: number; pendingApproval?: number; approved?: number; rejected?: number; averageScore?: number; }
  const formattedStats: StatsRecord = (stats as StatsRecord) || {
    todayDrafts: 0,
    pendingApproval: 0,
    approved: 0,
    rejected: 0,
    averageScore: 9.5,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-[#070908] border border-white/[0.06] rounded-2xl text-gray-200 font-sans overflow-hidden shadow-2xl">
      
      {/* ═══════════════════════════ HEADER ═══════════════════════════ */}
      <header className="shrink-0 h-14 bg-[#070908]/90 border-b border-white/[0.04] flex items-center justify-between px-6 z-20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-luxury-ivory/80 to-white flex items-center justify-center shadow-[0_0_10px_rgba(212,175,55,0.15)]">
            <Sparkles className="w-3.5 h-3.5 text-black" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white tracking-wider font-playfair uppercase">MOMIN OS</span>
            <span className="text-[9px] font-bold text-luxury-ivory uppercase tracking-[0.25em] px-1.5 py-0.5 rounded border border-luxury-ivory/20 bg-luxury-ivory/5">ACTIVE</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Intelligence Active</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="p-1.5 hover:bg-white/[0.04] rounded-lg transition text-gray-500 hover:text-white"
            title="Refresh Systems"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ═══════════════════════════ CONVERSATION SURFACE ═══════════════════════════ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-8 pb-48">

          {/* Landing Experience / Welcome State */}
          {copilotMessages.length === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-16 text-center space-y-6"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-luxury-ivory/20 to-white/10 border border-luxury-ivory/20 flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.05)]">
                <Sparkles className="w-7 h-7 text-luxury-ivory animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white font-playfair tracking-wide">Assalamu Alaikum, {adminName}</h2>
                <p className="text-xs text-gray-400 max-w-md mx-auto">MOMIN AI Operating System is active and synchronized. Let us process analytics, compose draft acknowledgements, or audit operations.</p>
              </div>

              {/* Single Quiet Status Line */}
              {drafts.filter(d => d.status === "pending").length > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.06] text-[10px] text-gray-500 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-luxury-ivory" />
                  <span>{drafts.filter(d => d.status === "pending").length} pending draft communications awaiting review</span>
                </div>
              )}

              {/* Suggested Prompts Grid */}
              <div className="flex flex-wrap justify-center gap-2 pt-4 max-w-lg mx-auto">
                {[
                  "Show today's donations",
                  "Give me a full breakdown of today's donations",
                  "Prepare a board briefing on Q2",
                  "Write an acknowledgement letter for Ahmed Khan",
                  "Allocate ₹50,000 to Family Relief",
                  "Run a compliance audit on Q2 ledger"
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSendCopilot(prompt)}
                    className="px-3.5 py-2 rounded-xl bg-white/[0.01] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] text-[11px] text-gray-400 hover:text-white transition duration-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Message Thread */}
          <AnimatePresence>
            {copilotMessages.map((msg) => {
              const isAssistant = msg.role === "assistant";
              const isWelcome = msg.id === "welcome";
              const msgSecs = expandedSections[msg.id] || {};
              const metadata: MessageMetadata = (msg.metadata as MessageMetadata) || {};
              const allowedComponents: string[] = metadata.allowedComponents || [];

              // Toggle switches based on blueprint availability
              const hasReferences = isAssistant && msg.references && msg.references.length > 0;
              const hasActionPlan = isAssistant && msg.actionPlan;
              const hasWorkflowPlan = isAssistant && msg.workflowPlan;
              const hasAnalytics = isAssistant && !isWelcome && stats && (allowedComponents.includes("analytics") || allowedComponents.includes("charts"));
              const hasSnapshot = isAssistant && !isWelcome && (allowedComponents.includes("tables") || allowedComponents.includes("records"));
              const hasPrograms = isAssistant && !isWelcome && programs.length > 0 && allowedComponents.includes("programs");
              const hasDrafts = isAssistant && !isWelcome && (allowedComponents.includes("drafts") || metadata.responseMode === "CREATION");
              const hasAudit = isAssistant && metadata.responseMode === "AUDIT";

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  <div className={`flex flex-col w-full px-6 py-4 rounded-xl transition-all duration-200 ${
                    isAssistant
                      ? 'bg-[#0a0d0b] border-l-4 border-luxury-ivory/50 shadow-md'
                      : 'bg-white/[0.02] border border-white/[0.04]'
                  }`}>
                    {isAssistant && (
                      <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-luxury-ivory/60 uppercase tracking-widest font-mono">
                        <Sparkles className="w-3 h-3" />
                        MOMIN
                      </div>
                    )}
                    
                    {!isAssistant && (
                      <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest font-mono">
                        <span className="text-emerald-500">{">"}</span> ADMIN / COMMAND
                      </div>
                    )}

                    <div className="w-full text-[13px] leading-relaxed text-gray-200 font-sans">
                      {isAssistant ? (
                        <MominMarkdown content={msg.content} />
                      ) : (
                        <div className="whitespace-pre-wrap text-gray-100">{msg.content}</div>
                      )}
                    </div>
                    
                    {/* Affordances / Progressive Disclosure Buttons */}
                      {isAssistant && !isWelcome && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          
                          {hasReferences && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "references")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.references 
                                  ? 'bg-white/[0.08] text-white border-white/[0.12]' 
                                  : 'bg-white/[0.02] text-gray-400 border-white/[0.04] hover:bg-white/[0.04]'
                              }`}
                            >
                              <Layers className="w-3 h-3" />
                              {msgSecs.references ? "Hide Evidence" : "View Evidence"}
                            </button>
                          )}

                          {hasActionPlan && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "actionPlan")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.actionPlan 
                                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40' 
                                  : 'bg-emerald-950/10 text-emerald-400/80 border-emerald-900/20 hover:bg-emerald-950/20'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {msgSecs.actionPlan ? "Hide Proposed Action" : "Review Proposed Action"}
                            </button>
                          )}

                          {hasWorkflowPlan && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "workflowPlan")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.workflowPlan 
                                  ? 'bg-white/[0.08] text-white border-white/[0.12]' 
                                  : 'bg-white/[0.02] text-gray-400 border-white/[0.04] hover:bg-white/[0.04]'
                              }`}
                            >
                              <Layers className="w-3 h-3" />
                              {msgSecs.workflowPlan ? "Hide Workflow status" : "View Workflow Plan"}
                            </button>
                          )}

                          {hasAnalytics && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "analytics")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.analytics 
                                  ? 'bg-luxury-ivory/20 text-white border-luxury-ivory/30' 
                                  : 'bg-white/[0.02] text-gray-400 border-white/[0.04] hover:bg-white/[0.04]'
                              }`}
                            >
                              <TrendingUp className="w-3 h-3" />
                              {msgSecs.analytics ? "Hide Analytics" : "View Analytics"}
                            </button>
                          )}

                          {hasSnapshot && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "snapshot")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.snapshot 
                                  ? 'bg-white/[0.08] text-white border-white/[0.12]' 
                                  : 'bg-white/[0.02] text-gray-400 border-white/[0.04] hover:bg-white/[0.04]'
                              }`}
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                              {msgSecs.snapshot ? "Hide Records" : "View Records"}
                            </button>
                          )}

                          {hasPrograms && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "programs")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.programs 
                                  ? 'bg-white/[0.08] text-white border-white/[0.12]' 
                                  : 'bg-white/[0.02] text-gray-400 border-white/[0.04] hover:bg-white/[0.04]'
                              }`}
                            >
                              <Briefcase className="w-3 h-3" />
                              {msgSecs.programs ? "Hide Program Progress" : "View Program Progress"}
                            </button>
                          )}

                          {hasDrafts && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "drafts")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.drafts 
                                  ? 'bg-luxury-ivory/20 text-white border-luxury-ivory/30' 
                                  : 'bg-white/[0.02] text-gray-400 border-white/[0.04] hover:bg-white/[0.04]'
                              }`}
                            >
                              <FileText className="w-3 h-3" />
                              {msgSecs.drafts ? "Hide Draft Reviewer" : "View Draft Reviewer"}
                            </button>
                          )}

                          {hasAudit && (
                            <button
                              type="button"
                              onClick={() => toggleSection(msg.id, "audit")}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition border ${
                                msgSecs.audit 
                                  ? 'bg-white/[0.08] text-white border-white/[0.12]' 
                                  : 'bg-white/[0.02] text-gray-400 border-white/[0.04] hover:bg-white/[0.04]'
                              }`}
                            >
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              {msgSecs.audit ? "Hide Audit Trail" : "View Audit Trail"}
                            </button>
                          )}

                        </div>
                      )}
                  </div>

                  {/* ━━━━━━━━━━ INLINE COLLAPSIBLE CHANNELS ━━━━━━━━━━ */}
                  <div className="max-w-[90%] space-y-2">
                    
                    {/* 1. REFERENCES GRID */}
                    {isAssistant && msgSecs.references && (msg.references?.length ?? 0) > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-3 bg-white/[0.01] border border-white/[0.04] rounded-xl space-y-2">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Certified Reference Records</div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {(msg.references ?? []).map((ref: { source: string; content: string }, idx: number) => (
                            <div key={idx} className="p-2 rounded bg-white/[0.02] border border-white/[0.04] text-[11px]">
                              <div className="font-bold text-white/80">{ref.source}</div>
                              <div className="text-gray-500 line-clamp-2 mt-0.5">{ref.content}</div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* 2. ACTION PLAN */}
                    {isAssistant && msgSecs.actionPlan && msg.actionPlan && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-emerald-950/10 border border-emerald-900/30 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Proposed Action Plan: {msg.actionPlan.planName}
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-400">{msg.actionPlan.reasoning}</p>
                        <div className="space-y-1.5">
                          {(msg.actionPlan.actions || []).map((act: { type: string; description: string }, idx: number) => (
                            <div key={idx} className="flex items-start gap-2 text-[11px] text-gray-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                              <span><span className="font-mono text-emerald-400 mr-1">[{act.type}]</span>{act.description}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleExecutePlan}
                            disabled={executingPlan}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition"
                          >
                            Authorize Execution
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* 3. WORKFLOW PLAN */}
                    {isAssistant && msgSecs.workflowPlan && msg.workflowPlan && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-white/[0.01] border border-white/[0.05] rounded-xl space-y-3">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          Workflow Blueprint: {msg.workflowPlan.workflowId || "MOMIN-PLAN"}
                        </div>
                        <div className="space-y-2">
                          {(msg.workflowPlan.tasks || []).map((t: { name: string; status?: string }, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded bg-white/[0.02]">
                              <span className="text-xs text-gray-300">{t.name}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded font-mono ${
                                t.status === "completed" ? "bg-emerald-950/20 text-emerald-400" : "bg-yellow-950/20 text-yellow-400"
                              }`}>{t.status}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* 4. ANALYTICS METRICS */}
                    {isAssistant && msgSecs.analytics && stats && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-white/[0.01] border border-white/[0.05] rounded-xl space-y-4">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">MOMIN AI Metrics Summary</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
                            <div className="text-[9px] text-gray-500 uppercase">Drafts Generated</div>
                            <div className="text-base font-bold text-white mt-1">{formattedStats.todayDrafts || 0}</div>
                          </div>
                          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
                            <div className="text-[9px] text-gray-500 uppercase">Average Score</div>
                            <div className="text-base font-bold text-luxury-ivory mt-1">{(formattedStats.averageScore || 9.5).toFixed(1)}</div>
                          </div>
                          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
                            <div className="text-[9px] text-gray-500 uppercase">Compliance</div>
                            <div className="text-base font-bold text-emerald-400 mt-1">{complianceHealth}</div>
                          </div>
                        </div>
                        
                        {/* Render simple Recharts visualization */}
                        <div className="h-40 w-full mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                              { name: "Approved", count: formattedStats.approved || 5 },
                              { name: "Pending", count: formattedStats.pendingApproval || 2 },
                              { name: "Rejected", count: formattedStats.rejected || 0 }
                            ]}>
                              <XAxis dataKey="name" stroke="#555" fontSize={10} />
                              <YAxis stroke="#555" fontSize={10} />
                              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                              <Bar dataKey="count" fill="#D4AF37" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </motion.div>
                    )}

                    {/* 5. DATABASE SNAPSHOT */}
                    {isAssistant && msgSecs.snapshot && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-white/[0.01] border border-white/[0.05] rounded-xl space-y-3">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5" />
                          Authoritative Ledger Status
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-gray-500 block">Total Donors</span>
                            <span className="text-base font-bold text-white mt-1 block">{donors.length}</span>
                          </div>
                          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-gray-500 block">Total Transactions</span>
                            <span className="text-base font-bold text-white mt-1 block">{donations.length}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* 6. TRUST PROGRAMS PROGRESS */}
                    {isAssistant && msgSecs.programs && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-white/[0.01] border border-white/[0.05] rounded-xl space-y-3">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5" />
                          Trust Program Allocations & progress
                        </div>
                        <div className="space-y-3.5">
                          {programs.slice(0, 4).map((p: FirestoreRecord, idx: number) => {
                            const pct = Math.round(((p.amountCollected as number) / (p.amountRequired as number)) * 100) || 0;
                            return (
                              <div key={idx} className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-gray-300 font-semibold">{p.title as string}</span>
                                  <span className="text-luxury-ivory font-mono">{pct}%</span>
                                </div>
                                <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-luxury-ivory to-white transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}

                    {/* 7. DRAFT REVIEWER */}
                    {isAssistant && msgSecs.drafts && selectedDraftId && editingContent && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-white/[0.01] border border-white/[0.06] rounded-xl space-y-4">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          Communication Draft Terminal
                        </div>
                        <div className="space-y-3 text-xs">
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Subject Line</label>
                            <input
                              type="text"
                              value={String(editingContent?.subject ?? "")}
                              onChange={(e) => setEditingContent({ ...editingContent, subject: e.target.value })}
                              className="w-full px-3 py-2 bg-[#070908] border border-white/[0.08] focus:border-luxury-ivory/40 rounded-lg text-xs text-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Message Body</label>
                            <textarea
                              value={String(editingContent?.body ?? "")}
                              onChange={(e) => setEditingContent({ ...editingContent, body: e.target.value })}
                              rows={5}
                              className="w-full px-3 py-2 bg-[#070908] border border-white/[0.08] focus:border-luxury-ivory/40 rounded-lg text-xs text-white focus:outline-none resize-none font-sans"
                            />
                          </div>
                        </div>

                        {editSuccess && (
                          <div className="text-[11px] text-emerald-400">✓ Changes successfully recorded to document staging layer</div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(selectedDraftId)}
                            disabled={processingAction === "approve"}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-luxury-ivory to-white hover:opacity-90 disabled:opacity-55 text-black rounded-lg text-[10px] font-bold transition uppercase tracking-wider"
                          >
                            Approve & Dispatch
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveChanges(selectedDraftId)}
                            disabled={processingAction === "edit"}
                            className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded-lg text-[10px] font-bold transition"
                          >
                            Save Staging
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(selectedDraftId)}
                            disabled={processingAction === "reject"}
                            className="px-3 py-1.5 bg-white/[0.02] hover:bg-rose-950/20 text-rose-400 rounded-lg text-[10px] font-semibold transition ml-auto"
                          >
                            Discard
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* 8. COMPLIANCE AUDIT TRACE */}
                    {isAssistant && msgSecs.audit && metadata.responseMode === "AUDIT" && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-white/[0.01] border border-[#d4af37]/20 rounded-xl space-y-3 font-mono text-[10px]">
                        <div className="text-[10px] font-bold text-luxury-ivory uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          Governance & Compliance Audit Trace
                        </div>
                        <div className="space-y-1 text-gray-400">
                          <div>Request ID: <span className="text-white">{metadata.requestId || "N/A"}</span></div>
                          <div>Validation Status: <span className="text-emerald-400">{metadata.status || "Verified"}</span></div>
                          <div>Confidence Level: <span className="text-luxury-ivory">{metadata.confidence || 100}%</span></div>
                          <div>Response Time: <span className="text-white">{metadata.developerDiagnostics?.responseTimeMs || "N/A"}ms</span></div>
                          <div>Certification Gate: <span className="text-white">{metadata.certification || "Level 4 (Deterministic Bypass)"}</span></div>
                        </div>
                      </motion.div>
                    )}

                  </div>

                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing Indicator */}
          {copilotLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-1.5 text-[9px] font-bold text-luxury-ivory/70 uppercase tracking-widest font-mono">
                  <Sparkles className="w-2.5 h-2.5 animate-spin" />
                  MOMIN SYSTEM
                </div>
                <div className="flex gap-1.5 p-3 rounded-2xl bg-white/[0.02]">
                  <span className="w-1.5 h-1.5 rounded-full bg-luxury-ivory/60 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-luxury-ivory/60 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-luxury-ivory/60 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </motion.div>
          )}

        </div>
      </div>

      {/* ═══════════════════════════ COMMAND COMPOSER ═══════════════════════════ */}
      <div className="shrink-0 bg-gradient-to-t from-[#070908] via-[#070908]/95 to-transparent pt-8 pb-6 px-4 border-t border-white/[0.02]">
        <div className="max-w-3xl mx-auto space-y-3.5">

          {/* Quick Actions / Suggested tags */}
          {copilotMessages.length <= 2 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
              {[
                { label: "Today's summary", prompt: "Show today's donations" },
                { label: "Detailed breakdown", prompt: "Give me a full breakdown of today's donations" },
                { label: "Q2 Executive Brief", prompt: "Prepare a board briefing on Q2" },
                { label: "Audit ledger", prompt: "Run a compliance audit on Q2 ledger" },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => handleSendCopilot(q.prompt)}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.07] hover:bg-white/[0.05] hover:border-white/[0.12] text-[10px] text-gray-400 hover:text-white transition duration-150"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Form Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (copilotInput.trim()) handleSendCopilot(copilotInput);
            }}
            className="flex items-end gap-3 bg-[#0a0c0b] border border-white/[0.08] focus-within:border-luxury-ivory/40 rounded-2xl p-3 shadow-2xl transition duration-150"
          >
            <textarea
              value={copilotInput}
              onChange={(e) => {
                setCopilotInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (copilotInput.trim()) handleSendCopilot(copilotInput);
                }
              }}
              placeholder="Command MOMIN AI OS..."
              rows={1}
              className="flex-1 bg-transparent px-2 py-1.5 text-xs focus:outline-none text-white placeholder-gray-600 resize-none min-h-[32px] max-h-[140px]"
              style={{ lineHeight: '1.5' }}
            />
            <button
              type="submit"
              disabled={copilotLoading || !copilotInput.trim()}
              className="shrink-0 p-2 bg-gradient-to-r from-luxury-ivory to-white hover:opacity-95 disabled:opacity-30 rounded-xl transition text-black"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

          <p className="text-center text-[9px] text-gray-600">MOMIN AI OS • Realtime Governance Certified • Authorized Operations Only</p>
        </div>
      </div>

    </div>
  );
}
