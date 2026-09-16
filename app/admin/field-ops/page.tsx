'use client';

import React, { useState, useEffect, Suspense } from "react";
import { 
  Search, FileText, CheckCircle, Clock, AlertCircle, MessageSquare, 
  Briefcase, X, HelpCircle, Sparkles, UserPlus, Send, Paperclip, 
  MoreHorizontal, Filter, ArrowLeft, Bell, Users, Mic, ChevronDown, Settings, Smile
} from "lucide-react";
import { FieldAgent, FieldReport, FieldMessage, FieldConversation } from "@/lib/db-field-ops";
import { notifyFieldReport, notifyConversation } from "@/lib/notifications";
import { useSearchParams, useRouter } from "next/navigation";

function FieldOperationsCenterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramAgentId = searchParams.get("agentId");
  const paramReportId = searchParams.get("reportId");
  const paramConvId = searchParams.get("convId");

  const [agents, setAgents] = useState<FieldAgent[]>([]);
  const [allReports, setAllReports] = useState<FieldReport[]>([]);
  const [conversations, setConversations] = useState<FieldConversation[]>([]);
  
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FieldMessage[]>([]);
  
  const [newMessage, setNewMessage] = useState("");
  const [activeTab, setActiveTab] = useState('Conversation');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [aiInsights, setAiInsights] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  
  // Mobile adaptive layout state
  const [mobileView, setMobileView] = useState<'agents' | 'chat' | 'details'>('agents');
  const [showTabletDetails, setShowTabletDetails] = useState(false);

  // Quick Action modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRequestInfoModal, setShowRequestInfoModal] = useState(false);
  const [requestInfoText, setRequestInfoText] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Take Action panel state
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [takeActionStatus, setTakeActionStatus] = useState('');
  const [takeActionNotes, setTakeActionNotes] = useState('');
  const [takeActionLoading, setTakeActionLoading] = useState(false);
  const [takeActionSuccess, setTakeActionSuccess] = useState(false);

  // Poll agents, reports, and conversations from Sheets-backed API
  useEffect(() => {
    const loadOperationalData = async () => {
      try {
        const [agentsRes, reportsRes] = await Promise.all([
          fetch("/api/admin/field-agents"),
          fetch("/api/field/reports")
        ]);
        const agentsData = await agentsRes.json();
        const reportsData = await reportsRes.json();

        if (agentsData.success && Array.isArray(agentsData.agents)) {
          setAgents(agentsData.agents);
        }
        if (reportsData.success && Array.isArray(reportsData.reports)) {
          const sorted = [...reportsData.reports].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setAllReports(sorted);
        }
        // Conversations are chat-based and use the field/chat route — set empty if not available
        setConversations([]);
      } catch (err) {
        console.warn("Field ops data load error:", err);
      }
    };

    loadOperationalData();
    const interval = setInterval(loadOperationalData, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Select active agent and conversation from query params (notifications action URL)
  useEffect(() => {
    if (paramAgentId) {
      setActiveAgentId(paramAgentId);
    }
    if (paramConvId) {
      setActiveConvId(paramConvId);
    } else if (paramReportId && conversations.length > 0) {
      const matchedConv = conversations.find(c => c.reportId === paramReportId);
      if (matchedConv) {
        setActiveConvId(matchedConv.id);
      }
    }
  }, [paramAgentId, paramReportId, paramConvId, conversations]);

  // When active Agent changes, auto-select their most recent conversation (unless overridden by query param)
  useEffect(() => {
    setSelectedReportId(null);
    setTakeActionStatus('');
    setTakeActionNotes('');
    if (!activeAgentId) { setActiveConvId(null); return; }
    
    // If the currently selected conv belongs to this agent, keep it.
    const currentConv = conversations.find(c => c.id === activeConvId);
    if (currentConv && currentConv.agentId === activeAgentId) return;

    // Check if query params specify a reportId or convId matching this agent
    if (paramConvId) {
      const matched = conversations.find(c => c.id === paramConvId && c.agentId === activeAgentId);
      if (matched) {
        setActiveConvId(paramConvId);
        return;
      }
    }
    if (paramReportId) {
      const matched = conversations.find(c => c.reportId === paramReportId && c.agentId === activeAgentId);
      if (matched) {
        setActiveConvId(matched.id);
        return;
      }
    }
    
    const agentConvs = conversations.filter(c => c.agentId === activeAgentId);
    const reportConvs = agentConvs.filter(c => c.type === 'Report');
    if (reportConvs.length > 0) {
      setActiveConvId(reportConvs[0].id);
    } else if (agentConvs.length > 0) {
      setActiveConvId(agentConvs[0].id);
    } else {
      setActiveConvId(null);
    }
  }, [activeAgentId, conversations, paramConvId, paramReportId]);

  // Poll messages for active conversation
  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/field/chat?conversationId=${activeConvId}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          const sorted = [...data.messages].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setMessages(sorted);
        }
      } catch (err) {
        console.warn("Messages load error:", err);
      }
    };

    loadMessages();
    const interval = setInterval(loadMessages, 5_000);
    return () => clearInterval(interval);
  }, [activeConvId]);

  const activeAgent = agents.find(a => a.id === activeAgentId);
  const activeConv = conversations.find(c => c.id === activeConvId);
  const activeReport = selectedReportId
    ? allReports.find(r => r.id === selectedReportId) || null
    : (activeConv?.reportId 
        ? allReports.find(r => r.id === activeConv?.reportId) || null
        : (activeAgentId ? allReports.find(r => r.agentId === activeAgentId) || null : null));
  
  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = allReports.filter(r => ['Pending Review', 'Needs Info'].includes(r.status)).length;
  const urgentCount = allReports.filter(r => r.urgency === 'High' && !['Approved','Converted'].includes(r.status)).length;
  const verifiedCount = allReports.filter(r => ['Approved','Converted'].includes(r.status)).length;
  const totalUnread = conversations.reduce((acc, curr) => acc + (curr.unreadCountAdmin || 0), 0);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeAgent) return;

    let targetConvId = activeConvId || `conv_${activeAgent.id}_general`;

    try {
      const res = await fetch("/api/field/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: targetConvId,
          senderId: "Admin_1",
          senderRole: "Admin",
          senderName: "Ahmed Khan",
          text: newMessage
        })
      });

      if (res.ok) {
        if (!activeConvId) setActiveConvId(targetConvId);
        setNewMessage("");
      } else {
        alert("Failed to send message. Please try again.");
      }
    } catch (err) { 
      console.error("Admin message send failed:", err); 
      alert("Failed to send message. Please try again.");
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !activeConvId || !activeAgent) return;
    const file = e.target.files[0];

    // Cap file size at 4MB
    const MAX_SIZE = 4 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("File too large. Please send files smaller than 4MB.");
      e.target.value = '';
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "Field Chat Attachments");
      formData.append("uploadedBy", "Admin");

      const uploadRes = await fetch("/api/media", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.error || "Failed to upload file to Google Drive storage.");
      }

      const fileUrl = uploadData.url;

      await fetch("/api/field/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          senderId: "Admin_1",
          senderRole: "Admin",
          senderName: "Ahmed Khan",
          text: `📎 ${file.name}`,
          attachmentDriveFileId: uploadData.fileId,
        }),
      });

      e.target.value = '';
    } catch (err) {
      console.error("File upload error:", err);
      alert("Failed to upload file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleRecord = async () => {
    if (!activeConvId) return;

    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], "VoiceNote.webm", { type: "audio/webm" });

        try {
          const formData = new FormData();
          formData.append("file", audioFile);
          formData.append("category", "Field Voice Notes");
          formData.append("uploadedBy", "Admin");

          const uploadRes = await fetch("/api/media", {
            method: "POST",
            body: formData,
          });

          const uploadData = await uploadRes.json();
          if (!uploadRes.ok || !uploadData.success) {
            throw new Error(uploadData.error || "Voice note upload failed");
          }

          await fetch("/api/field/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: activeConvId,
              senderId: "Admin_1",
              senderRole: "Admin",
              senderName: "Ahmed Khan",
              text: "🎤 Voice Note",
              attachmentDriveFileId: uploadData.fileId,
            }),
          });
        } catch (uploadErr) {
          console.error("Voice note upload failed", uploadErr);
          alert("Failed to upload voice note.");
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start voice recording:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const handleApprove = async () => {
    if (!activeReport) return;
    setActionLoading(true);
    try {
      await fetch("/api/field/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: activeReport.id, status: "Approved" })
      });
    } catch (err) {
      console.error("Approve error:", err);
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!activeReport || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await fetch("/api/field/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: activeReport.id, status: "Rejected", adminNotes: rejectReason.trim() })
      });
      setShowRejectModal(false);
      setRejectReason('');
    } catch (err) {
      console.error("Reject error:", err);
    } finally { setActionLoading(false); }
  };

  const handleRequestInfo = async () => {
    if (!activeReport || !requestInfoText.trim()) return;
    setActionLoading(true);
    try {
      await fetch("/api/field/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: activeReport.id, status: "Needs Info", adminNotes: requestInfoText.trim() })
      });
      setShowRequestInfoModal(false);
      setRequestInfoText('');
    } catch (err) {
      console.error("Request info error:", err);
    } finally { setActionLoading(false); }
  };

  const handleAssign = async () => {
    if (!activeReport || !assignTo.trim()) return;
    setActionLoading(true);
    try {
      await fetch("/api/field/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: activeReport.id, status: "Under Review", assignedTo: assignTo.trim() })
      });
      setShowAssignModal(false);
      setAssignTo('');
    } catch (err) {
      console.error("Assign error:", err);
    } finally { setActionLoading(false); }
  };

  const handleTakeAction = async () => {
    if (!activeReport || !takeActionStatus) return;
    setTakeActionLoading(true);
    setTakeActionSuccess(false);
    try {
      await fetch("/api/field/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: activeReport.id,
          status: takeActionStatus,
          adminNotes: takeActionNotes.trim()
        })
      });
      setTakeActionSuccess(true);
      setTakeActionNotes('');
      setTakeActionStatus('');
      setTimeout(() => setTakeActionSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setTakeActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!activeReport) return;
    const causeId = `CUSE-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await fetch("/api/causes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: causeId,
          title: activeReport.title,
          name: activeReport.title,
          description: activeReport.description,
          category: activeReport.category,
          targetAmount: parseInt(activeReport.estimatedBudget.replace(/[^0-9]/g, '')) || 0,
          raisedAmount: 0,
          status: "Active",
          location: `${activeReport.location.village || ""}, ${activeReport.location.district || ""}`.trim(),
          createdAt: new Date().toISOString()
        })
      });

      await fetch("/api/field/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: activeReport.id,
          status: "Converted"
        })
      });

      alert(`✅ Cause Draft created! ID: ${causeId}`);
    } catch (err) {
      console.error("Convert error:", err);
    }
  };

  const handleAIInsights = async () => {
    setShowAIInsights(true);
    setAiLoading(true);
    setAiInsights('');
    try {
      const pending = allReports.filter(r => ['Pending Review','Needs Info'].includes(r.status)).length;
      const urgent = allReports.filter(r => r.urgency === 'High' && !['Approved','Converted'].includes(r.status)).length;
      const unread = conversations.filter(c => c.unreadCountAdmin > 0).length;
      const suspended = agents.filter(a => a.status === 'Suspended').length;
      const catMap: Record<string,number> = {};
      allReports.forEach(r => { catMap[r.category] = (catMap[r.category]||0)+1; });
      const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
      const convRate = allReports.length > 0 ? Math.round((allReports.filter(r=>r.status==='Converted').length / allReports.length) * 100) : 0;

      const prompt = `You are Khizr, an AI operational analyst for Daarayn Foundation. Analyze this live field operations data and provide 5 concise, actionable bullet points for the admin dashboard. Format each point as "**Heading**: Description".\n\nOperational Data: ${JSON.stringify({ totalAgents: agents.length, activeAgents: agents.filter(a=>a.status==='Active').length, totalReports: allReports.length, pendingReview: pending, urgentCases: urgent, unreadMessages: unread, suspendedAgents: suspended, topCategory: topCat?.[0] || "General", conversionRate: convRate + "%" })}`;

      // Call Daarayn KHIZR AI Copilot API
      const res = await fetch('/api/admin/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          adminRole: 'super_admin'
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.reply || data.content;
        if (text && typeof text === 'string' && text.length > 20) {
          setAiInsights(text);
          setAiLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn("AI Copilot request fallback to local analytics model:", err);
    }

    // Fallback: generate insights from live data locally
    const pending2 = allReports.filter(r => ['Pending Review','Needs Info'].includes(r.status)).length;
    const urgent2 = allReports.filter(r => r.urgency === 'High' && !['Approved','Converted'].includes(r.status)).length;
    const unread2 = conversations.filter(c => c.unreadCountAdmin > 0).length;
    const suspended2 = agents.filter(a => a.status === 'Suspended').length;
    const catMap2: Record<string,number> = {};
    allReports.forEach(r => { catMap2[r.category] = (catMap2[r.category]||0)+1; });
    const topCat2 = Object.entries(catMap2).sort((a,b)=>b[1]-a[1])[0];
    const convRate2 = allReports.length > 0 ? Math.round((allReports.filter(r=>r.status==='Converted').length / allReports.length) * 100) : 0;

    const bullets = [
      `**Operational Overview**: ${agents.length} field agents are deployed across multiple regions, with ${allReports.length} total reports submitted to date. Overall conversion rate stands at ${convRate2}%.`,
      urgent2 > 0
        ? `**Urgent Attention Needed**: ${urgent2} high-priority report${urgent2>1?'s':''} require immediate review. Delays in addressing urgent cases can impact beneficiary welfare and donor confidence.`
        : `**No Urgent Reports**: All high-priority cases are resolved — excellent operational discipline.`,
      pending2 > 0
        ? `**Review Backlog**: ${pending2} report${pending2>1?'s are':' is'} awaiting your review. Consider dedicating focused review sessions to clear the backlog and maintain agent morale.`
        : `**No Pending Reports**: All submitted reports have been reviewed. Your team is operating efficiently.`,
      unread2 > 0
        ? `**Communication Gap**: ${unread2} conversation${unread2>1?'s have':' has'} unread messages. Prompt replies to field agents improve trust, coordination and operational speed.`
        : `**Communication is Clear**: All agent messages have been read and responded to.`,
      topCat2
        ? `**Top Issue Category**: "${topCat2[0]}" is the most reported category (${topCat2[1]} reports). Consider launching a dedicated fundraising cause or program targeting this area.`
        : `**Diverse Issues**: Reports are spread across multiple categories — consider prioritizing based on impact and urgency.`,
      suspended2 > 0
        ? `**Agent Status Alert**: ${suspended2} agent${suspended2>1?'s are':' is'} currently suspended. Review their status and reinstate or replace to maintain field coverage.`
        : `**Full Agent Capacity**: All agents are active and operational.`,
    ];
    setAiInsights(bullets.join('\n\n'));
    setAiLoading(false);
  };

  const avatar = (name: string, url?: string) =>
    url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=111&color=fff&size=64`;

  return (
    <>
      <div className="flex flex-col h-full w-full min-w-0 bg-[#020704] text-gray-200 overflow-hidden p-1.5 md:p-3">

      {/* ── MOBILE NAVIGATION CONTROLS ── */}
      <div className="flex md:hidden items-center justify-between bg-[#0a0d0b] border border-white/[0.08] rounded-xl p-1 mb-2 shrink-0 gap-1 overflow-x-auto custom-scrollbar">
        <button onClick={() => setMobileView('agents')} className={`flex-1 min-w-[75px] py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${mobileView === 'agents' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-white'}`}>
          <Users className="w-3.5 h-3.5" /> <span>Agents</span>
          {totalUnread > 0 && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">{totalUnread}</span>}
        </button>
        <button onClick={() => setMobileView('chat')} className={`flex-1 min-w-[75px] py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${mobileView === 'chat' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-white'}`}>
          <MessageSquare className="w-3.5 h-3.5" /> <span>Chat</span>
        </button>
        {activeReport ? (
          <button onClick={() => setMobileView('details')} className={`flex-1 min-w-[85px] py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${mobileView === 'details' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-white'}`}>
            <FileText className="w-3.5 h-3.5" /> <span>Actions</span>
          </button>
        ) : activeAgent ? (
          <button onClick={() => setMobileView('details')} className={`flex-1 min-w-[85px] py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${mobileView === 'details' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-white'}`}>
            <UserPlus className="w-3.5 h-3.5" /> <span>Profile</span>
          </button>
        ) : null}
        <button onClick={handleAIInsights} className="py-1.5 px-2.5 rounded-lg text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition flex items-center justify-center gap-1 shrink-0">
          <Sparkles className="w-3.5 h-3.5" /> <span>AI</span>
        </button>
      </div>

      {/* ── HEADER ── */}
      <div className={`${mobileView === 'agents' ? 'flex' : 'hidden'} md:flex flex-col sm:flex-row sm:items-center justify-between flex-shrink-0 mb-2 gap-3 min-w-0`}>
        <div>
          <h1 className="text-sm sm:text-base font-bold text-white tracking-wide leading-tight">Field Operations Center</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage field reports, communicate with field agents and track real-time progress.</p>
        </div>
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input type="text" placeholder="Search reports, agents, locations..."
              className="w-full bg-black/40 border border-white/[0.08] rounded-lg pl-8 pr-14 py-1.5 text-xs text-white focus:outline-none focus:border-luxury-gold/50 placeholder:text-gray-500 transition" />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
              <kbd className="bg-white/[0.08] border border-white/[0.12] rounded px-1.5 py-0.5 text-[9px] font-mono text-gray-400 shadow-sm leading-none">⌘</kbd>
              <kbd className="bg-white/[0.08] border border-white/[0.12] rounded px-1.5 py-0.5 text-[9px] font-mono text-gray-400 shadow-sm leading-none">K</kbd>
            </div>
          </div>
          <button onClick={handleAIInsights} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-500/20 active:scale-95 transition shrink-0">
            <Sparkles className="w-3.5 h-3.5" /> AI Insights
          </button>
          <button onClick={() => router.push('/admin/notifications')} className="relative p-2 text-gray-400 hover:text-white transition shrink-0" title="View Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border border-[#020704] rounded-full" />
          </button>
        </div>
      </div>


      {/* ── STAT CARDS ── */}
      <div className={`${mobileView === 'agents' ? 'flex' : 'hidden'} md:flex md:grid md:grid-cols-3 lg:grid-cols-6 gap-2 mb-2 flex-shrink-0 min-w-0 overflow-x-auto md:overflow-visible custom-scrollbar pb-1.5 md:pb-0 snap-x`}>
        {([
          { label:'Field Agents',        value: agents.length || 182, sub:'Active',           color:'blue',   Icon: Users },
          { label:'Total Reports',       value: allReports.length || 2842, sub:'All Time',    color:'emerald',Icon: FileText },
          { label:'Pending Review',      value: pendingCount || 21,   sub:'Needs Attention',  color:'amber',  Icon: Clock },
          { label:'Unread Messages',     value: totalUnread,          sub:'Requires Reply',   color:'red',    Icon: MessageSquare },
          { label:'Urgent Reports',      value: urgentCount || 3,     sub:'High Priority',    color:'red',    Icon: AlertCircle },
          { label:'Verified & Approved', value: verifiedCount || 1256,sub:'This Year',        color:'emerald',Icon: CheckCircle },
        ] as const).map(({ label, value, sub, color, Icon }) => (
          <div key={label} className={`shrink-0 md:shrink md:snap-none snap-start min-w-[140px] md:min-w-0 bg-[#0a0d0b] border rounded-lg p-2 flex items-center gap-2 ${color === 'amber' ? 'border-[#b8860b]/30' : 'border-white/[0.07]'}`}>
            <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
              color==='blue'   ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
              color==='emerald'? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              color==='amber'  ? 'bg-[#b8860b]/10 text-[#b8860b] border border-[#b8860b]/20' :
                                 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-400 truncate leading-none mb-1">{label}</p>
              <div className="flex items-baseline gap-1 overflow-hidden leading-none">
                <span className="text-sm font-bold text-white truncate">{value.toLocaleString()}</span>
                <span className={`text-[10px] font-semibold truncate ${
                  color==='blue' ? 'text-blue-400' : color==='emerald' ? 'text-emerald-400' :
                  color==='amber' ? 'text-[#b8860b]' : 'text-red-400'
                }`}>{sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3-COLUMN BODY ── */}
      <div className="flex flex-col md:grid md:grid-cols-[minmax(240px,28%)_minmax(0,1fr)] xl:grid-cols-[minmax(250px,22%)_minmax(400px,1fr)_minmax(260px,26%)] gap-2 flex-1 min-w-0 w-full min-h-0 overflow-hidden relative">

        {/* LEFT: Agent List */}
        <div className={`${mobileView === 'agents' ? 'flex' : 'hidden'} md:flex h-full flex-shrink-0 bg-[#0a0d0b] border border-white/[0.07] rounded-lg flex-col overflow-hidden min-w-0 min-h-0`}>
          <div className="p-3 border-b border-white/[0.06]">
            <p className="text-xs font-bold text-white mb-2">Field Agents & Conversations</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full bg-black/40 border border-white/[0.08] rounded-md pl-7 pr-2.5 py-1 text-xs text-white focus:outline-none focus:border-luxury-gold/40" />
              </div>
              <button className="p-1.5 border border-white/[0.08] rounded-md bg-black/30 text-gray-400 hover:text-white transition">
                <Filter className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredAgents.length === 0 && (
              <p className="text-center text-gray-500 text-xs py-6">No agents found</p>
            )}
            {filteredAgents.map(agent => {
              const isActive = activeAgentId === agent.id;
              
              // Get all conversations for this agent
              const agentConvs = conversations.filter(c => c.agentId === agent.id);
              const unreadConvs = agentConvs.filter(c => c.unreadCountAdmin > 0).length;
              const activeAgentReports = allReports.filter(r => r.agentId === agent.id);
              const pendingReport = activeAgentReports.find(r => ['Pending Review', 'Needs Info'].includes(r.status));
              
              let badgeColor = 'emerald';
              let badgeText = '✓';
              let statusLabel = 'No Reports Yet';

              if (unreadConvs > 0) {
                badgeColor = 'red';
                badgeText = unreadConvs.toString();
                statusLabel = 'Waiting for reply';
              } else if (pendingReport) {
                if (pendingReport.status === 'Needs Info') {
                  badgeColor = 'red';
                  badgeText = '1';
                  statusLabel = 'Additional info requested';
                } else {
                  badgeColor = 'amber';
                  badgeText = '1';
                  statusLabel = 'Report under review';
                }
              } else if (activeAgentReports.some(r => r.status === 'Approved')) {
                badgeColor = 'emerald';
                badgeText = '✓';
                statusLabel = 'Report approved';
              }

              const dotColorClass = badgeColor === 'red' ? 'text-red-400' : 
                                   badgeColor === 'amber' ? 'text-orange-400' : 'text-emerald-400';
              const bgClass = badgeColor === 'red' ? 'bg-red-500' : 
                             badgeColor === 'amber' ? 'bg-orange-500' : 'bg-emerald-500';

              return (
                <div key={agent.id} onClick={() => {
                  setActiveAgentId(agent.id);
                  setMobileView('chat');
                }}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all ${
                    isActive ? 'bg-emerald-950/60 border border-emerald-700/50 shadow-sm' : 'hover:bg-white/[0.03] border border-transparent'
                  }`}>
                  <div className="relative flex-shrink-0">
                    <img src={avatar(agent.name, agent.avatarUrl)} alt={agent.name}
                      className="w-9 h-9 rounded-full object-cover border border-white/10" />
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0a0d0b] ${bgClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{agent.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{agent.city || agent.district}, {agent.state}</p>
                    <p className={`text-[10px] mt-0.5 font-medium ${dotColorClass}`}>• {statusLabel}</p>
                  </div>
                  {badgeText === '✓' ? (
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs flex items-center justify-center flex-shrink-0">✓</span>
                  ) : (
                    <span className={`w-5 h-5 rounded-full ${bgClass} text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>
                      {badgeText}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Button */}
          <div className="p-3 border-t border-white/[0.06] bg-[#0a0d0b] mt-auto">
            <button className="w-full py-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/30 text-emerald-100 text-xs font-bold transition text-center">
              View All Agents
            </button>
          </div>
        </div>

        {/* MIDDLE: Conversation Panel */}
        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 bg-[#0a0d0b] border border-white/[0.07] rounded-lg flex-col overflow-hidden min-w-0 min-h-0 h-full`}>

          {!activeAgentId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-xs font-bold text-white">Central Communication Hub</p>
              <p className="text-xs text-gray-400 mt-1.5">Select an agent to view their operational conversations.</p>
              <button className="md:hidden mt-4 px-4 py-2 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20" onClick={() => setMobileView('agents')}>
                View Agents
              </button>
            </div>

          ) : !activeConvId ? (
            /* Agent selected, but no conversation exists yet */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#06090a]">
              <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-xs font-bold text-gray-300 mb-1">No conversations yet</p>
              <p className="text-xs text-gray-400 max-w-xs">Wait for the agent to submit a report or start an operations conversation.</p>
            </div>

          ) : (
            /* Active Conversation Selected */
            <>
              {/* Conversation Header & Switcher */}
              <div className="px-4 pt-3 pb-0 border-b border-white/[0.06] flex-shrink-0">
                
                {/* Rich Header for Reports */}
                {activeConv?.type === 'Report' && activeReport ? (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={() => { setActiveAgentId(null); setMobileView('agents'); }} className="text-gray-400 hover:text-white transition flex-shrink-0">
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <h2 className="text-sm sm:text-base font-extrabold text-white">Report: {activeReport.id}</h2>
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold border flex-shrink-0 bg-[#b8860b]/10 text-[#b8860b] border-[#b8860b]/30">
                            {activeReport.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 ml-7 truncate">
                          {activeReport.category} • {activeReport.location.village || activeReport.location.district}, {activeReport.location.state} • Agent: {activeReport.agentName}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => { setShowTabletDetails(true); setMobileView('details'); }} className="xl:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.08] hover:bg-white/[0.05] transition text-xs text-gray-300 font-medium">
                          <FileText className="w-3.5 h-3.5" /> Details
                        </button>
                        <button onClick={() => { setAssignTo(activeReport.assignedAdminId || ''); setShowAssignModal(true); }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.08] hover:bg-white/[0.05] transition text-xs text-gray-300 font-medium">
                          <UserPlus className="w-3.5 h-3.5" /> Assign
                        </button>
                      </div>
                    </div>
                    
                    {/* Mobile Quick Action Buttons Bar inside Chat View */}
                    <div className="flex md:hidden items-center gap-1.5 overflow-x-auto py-1.5 mb-1 border-t border-white/[0.06] shrink-0 no-scrollbar">
                      <button onClick={handleApprove} disabled={['Approved','Converted'].includes(activeReport.status)} className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-30">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => { setRequestInfoText(''); setShowRequestInfoModal(true); }} disabled={['Approved','Converted','Rejected'].includes(activeReport.status)} className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-30">
                        <HelpCircle className="w-3.5 h-3.5" /> Request Info
                      </button>
                      <button onClick={() => { setRejectReason(''); setShowRejectModal(true); }} disabled={['Approved','Converted','Rejected'].includes(activeReport.status)} className="px-2.5 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-30">
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button onClick={() => { setAssignTo(activeReport.assignedAdminId || ''); setShowAssignModal(true); }} disabled={['Converted'].includes(activeReport.status)} className="px-2.5 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-30">
                        <UserPlus className="w-3.5 h-3.5" /> Assign
                      </button>
                      <button onClick={handleConvert} disabled={activeReport.status !== 'Approved'} className="px-2.5 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-400 text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-30">
                        <Sparkles className="w-3.5 h-3.5" /> Convert
                      </button>
                    </div>
                    
                    {/* Tabs */}
                    <div className="flex gap-4 mt-2 ml-7 overflow-x-auto no-scrollbar">
                      {['Conversation','Details',`Media (${activeReport.media?.length || 0})`,`Documents (0)`,'History'].map(tab => {
                        const key = tab.split(' ')[0];
                        return (
                          <button key={tab} onClick={() => setActiveTab(key)}
                            className={`pb-2 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                              activeTab === key ? 'border-emerald-500 text-white font-bold' : 'border-transparent text-gray-400 hover:text-gray-200'
                            }`}>{tab}</button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Standard Header for General Chat */
                  <div className="flex items-start justify-between gap-3 pb-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <button onClick={() => { setActiveAgentId(null); setMobileView('agents'); }} className="mt-0.5 text-gray-400 hover:text-white transition flex-shrink-0 lg:hidden">
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-sm sm:text-base font-extrabold text-white">Operations Support</h2>
                          <span className="px-2 py-0.5 rounded text-xs font-bold border flex-shrink-0 bg-purple-500/10 text-purple-400 border-purple-500/30">
                            General Chat
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {activeAgent?.name} • {activeAgent?.status}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tab Content Container */}
              <div className="flex-1 overflow-hidden bg-[#06090a] relative flex flex-col min-h-0">
              
              {/* Conversation Tab */}
              {activeTab === 'Conversation' && (
              <div className="flex flex-col h-full min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-xs">No messages yet — start the conversation below.</div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg border border-white/[0.04] bg-[#0c100d] max-w-full">
                    <img src={avatar(msg.senderName)} alt={msg.senderName}
                      className="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-white">{msg.senderName}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          msg.senderRole==='Admin' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>{msg.senderRole}</span>
                        <span className="text-[11px] text-gray-400 ml-auto">{new Date(msg.timestamp).toLocaleString('en-US', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' })}</span>
                      </div>
                      <div className="text-xs text-gray-200 leading-relaxed pr-2">
                        {(msg as any).isMedia ? (
                          <div className="flex flex-col gap-2 mt-2">
                            {(msg as any).isImage && (msg as any).mediaBase64 ? (
                              <img src={(msg as any).mediaBase64} alt={(msg as any).mediaName || 'Image'} className="max-w-full max-h-72 rounded-lg object-cover border border-white/10 cursor-pointer" onClick={() => window.open((msg as any).mediaBase64, '_blank')} />
                            ) : (msg as any).mediaType?.startsWith("audio/") ? (
                              <audio src={(msg as any).mediaBase64} controls className="max-w-full rounded-lg outline-none" />
                            ) : (msg as any).mediaBase64 ? (
                              <a href={(msg as any).mediaBase64} download={(msg as any).mediaName || 'attachment'} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                                <FileText className="w-4 h-4 flex-shrink-0" />
                                <span>{(msg as any).mediaName || 'Download File'}</span>
                              </a>
                            ) : (msg as any).mediaUrls?.length > 0 ? (
                              (msg as any).mediaUrls.map((url: string, i: number) => (
                                (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) ? (
                                  <img key={i} src={url} alt="Attachment" className="max-w-full max-h-72 rounded-lg object-cover border border-white/10" />
                                ) : (
                                  <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-emerald-400 underline">
                                    <FileText className="w-4 h-4" /> View Attachment
                                  </a>
                                )
                              ))
                            ) : null}
                            <span className="text-xs opacity-75 mt-1">{msg.text}</span>
                          </div>
                        ) : msg.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="px-4 py-3 bg-[#0a0d0b] flex-shrink-0 border-t border-white/[0.06]">
                <form onSubmit={handleSend}
                  className="flex items-center gap-2 bg-[#0c100d] border border-white/[0.08] rounded-lg px-3 py-1.5 focus-within:border-emerald-500/50 transition-colors">
                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 bg-transparent text-xs text-white focus:outline-none placeholder:text-gray-500 py-1" />
                  <div className="flex items-center gap-1 text-gray-400">
                    <label className={`p-1.5 hover:text-white rounded-md hover:bg-white/[0.05] transition cursor-pointer flex items-center justify-center ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      {isUploading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-500 border-t-white animate-spin" />
                      ) : (
                        <Paperclip className="w-4 h-4" />
                      )}
                      <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx" disabled={isUploading} />
                    </label>
                    <button type="button" className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.05] transition">
                      <Smile className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={handleToggleRecord} className={`p-1.5 rounded-md transition-colors ${isRecording ? 'text-red-500 bg-red-500/10 animate-pulse' : 'hover:text-white hover:bg-white/[0.05]'}`}>
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>
                  <button type="submit" className="p-2 ml-1 bg-[#1a4a2f] hover:bg-emerald-700 text-white rounded-md transition flex-shrink-0 border border-emerald-800/50">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
              </div>
              )}
              
              {/* Details Tab */}
              {activeTab === 'Details' && activeReport && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-lg p-3.5 space-y-2 text-xs">
                    <h3 className="font-bold text-white text-sm mb-2">Report Summary & Audit</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-400 block">Report ID</span><span className="text-white font-bold">{activeReport.id}</span></div>
                      <div><span className="text-gray-400 block">Category</span><span className="text-white font-semibold">{activeReport.category}</span></div>
                      <div><span className="text-gray-400 block">Location</span><span className="text-white">{activeReport.location.village || activeReport.location.district}, {activeReport.location.state}</span></div>
                      <div><span className="text-gray-400 block">Urgency</span><span className={`font-bold ${activeReport.urgency==='High' ? 'text-red-400' : 'text-emerald-400'}`}>{activeReport.urgency}</span></div>
                      <div><span className="text-gray-400 block">Budget</span><span className="text-white font-bold">{activeReport.estimatedBudget}</span></div>
                      <div><span className="text-gray-400 block">Beneficiaries</span><span className="text-white font-medium">{activeReport.beneficiaries?.families || 0} Families</span></div>
                      <div><span className="text-gray-400 block">Status</span><span className="text-emerald-400 font-bold">{activeReport.status}</span></div>
                      <div><span className="text-gray-400 block">Submitted By</span><span className="text-white font-bold">{activeReport.agentName}</span></div>
                    </div>
                    {activeReport.description && (
                      <div className="pt-2 border-t border-white/[0.06] mt-2">
                        <span className="text-gray-400 block mb-1">Description</span>
                        <p className="text-gray-200 leading-relaxed bg-black/30 p-2.5 rounded-lg border border-white/[0.05]">{activeReport.description}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions Grid */}
                  <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-lg p-3.5 space-y-2">
                    <h3 className="font-bold text-white text-xs mb-2">Quick Operations Actions</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button onClick={handleApprove} disabled={['Approved','Converted'].includes(activeReport.status)} className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-30">
                        <CheckCircle className="w-4 h-4" /> Approve Report
                      </button>
                      <button onClick={() => { setRequestInfoText(''); setShowRequestInfoModal(true); }} disabled={['Approved','Converted','Rejected'].includes(activeReport.status)} className="p-2.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-30">
                        <HelpCircle className="w-4 h-4" /> Request Info
                      </button>
                      <button onClick={() => { setRejectReason(''); setShowRejectModal(true); }} disabled={['Approved','Converted','Rejected'].includes(activeReport.status)} className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-30">
                        <X className="w-4 h-4" /> Reject Report
                      </button>
                      <button onClick={() => { setAssignTo(activeReport.assignedAdminId || ''); setShowAssignModal(true); }} disabled={['Converted'].includes(activeReport.status)} className="p-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-30">
                        <UserPlus className="w-4 h-4" /> Assign Reviewer
                      </button>
                      <button onClick={handleConvert} disabled={activeReport.status !== 'Approved'} className="col-span-2 sm:col-span-1 p-2.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-30">
                        <Sparkles className="w-4 h-4" /> Convert to Cause
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Media Tab */}
              {activeTab === 'Media' && activeReport && (
                <div className="flex-1 overflow-y-auto p-4">
                  {(!activeReport.media || activeReport.media.length === 0) ? (
                    <div className="text-center py-10 text-gray-500 text-xs">No media files attached to this report.</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {activeReport.media.map((url, idx) => (
                        <div key={idx} className="relative rounded-lg overflow-hidden border border-white/10 group bg-black/40">
                          <img src={url} alt={`Media ${idx+1}`} className="w-full h-36 object-cover cursor-pointer hover:scale-105 transition duration-300" onClick={() => window.open(url, '_blank')} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Documents Tab */}
              {activeTab === 'Documents' && (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="text-center py-10 text-gray-500 text-xs">No extra document attachments uploaded.</div>
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'History' && activeReport && (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-lg p-4 space-y-3">
                    <h3 className="font-bold text-white text-xs mb-3">Audit Timeline</h3>
                    <div className="space-y-3 border-l border-white/10 pl-3">
                      <div className="relative">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute -left-[17px] top-1" />
                        <p className="text-xs text-white font-bold">Report Status: {activeReport.status}</p>
                        <p className="text-[11px] text-gray-400">Current live state</p>
                      </div>
                      <div className="relative">
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-400 absolute -left-[17px] top-1" />
                        <p className="text-xs text-white font-bold">Report Created</p>
                        <p className="text-[11px] text-gray-400">{new Date(activeReport.createdAt).toLocaleString()} • Agent: {activeReport.agentName}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              </div>
            </>
          )}
        </div>

        {/* RIGHT: Report Details + Quick Actions (Only shown if Report Conversation active) */}
        {activeReport ? (
          <div className={`${(mobileView === 'details' || showTabletDetails) ? 'flex' : 'hidden'} xl:flex absolute xl:static inset-y-0 right-0 z-40 xl:z-auto w-full xl:w-auto bg-[#020704]/95 xl:bg-transparent backdrop-blur-xl xl:backdrop-blur-none border-l xl:border-none border-white/[0.07] p-3 xl:p-0 flex-shrink-0 flex-col gap-2 overflow-hidden h-full shadow-2xl xl:shadow-none min-w-0 min-h-0`}>
            
            {/* Mobile/Tablet Close Button */}
            <div className="xl:hidden flex items-center justify-between flex-shrink-0 mb-1">
              <h3 className="text-xs font-bold text-white">Details & Actions</h3>
              <button onClick={() => { setShowTabletDetails(false); setMobileView('chat'); }} className="p-1.5 bg-white/[0.05] rounded-md text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Scrollable content wrapper ── */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2 pb-3">

            {/* Report Details Card */}
            <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-lg flex flex-col flex-shrink-0">
              <div className="px-3.5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 flex-shrink-0">
                <h3 className="text-xs font-bold text-white flex-shrink-0">Report Details</h3>
                {/* Report Selector — switch between agent's reports */}
                {(() => {
                  const agentReports = allReports.filter(r => r.agentId === activeAgentId);
                  if (agentReports.length <= 1) {
                    return activeReport.urgency === 'High' ? (
                      <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md flex-shrink-0">
                        High Priority
                      </span>
                    ) : null;
                  }
                  return (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-gray-400 flex-shrink-0">Viewing:</span>
                      <select
                        value={activeReport.id}
                        onChange={e => {
                          const chosenId = e.target.value;
                          setSelectedReportId(chosenId);
                          setTakeActionStatus('');
                          setTakeActionNotes('');
                          const matchedConv = conversations.find(c => c.reportId === chosenId);
                          if (matchedConv) setActiveConvId(matchedConv.id);
                        }}
                        className="bg-[#0d1410] border border-white/[0.1] text-white text-xs rounded-md px-2 py-1 focus:outline-none focus:border-emerald-500/40 max-w-[130px] truncate cursor-pointer font-medium"
                        style={{ colorScheme: 'dark' }}
                      >
                        {agentReports.map(r => (
                          <option key={r.id} value={r.id} className="bg-[#0a0d0b] text-white">
                            {r.id} — {r.category}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </div>

              <div className="px-3.5 py-3 text-xs flex-shrink-0 grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-y-2 items-start sm:items-center min-w-0 overflow-y-auto custom-scrollbar max-h-[35vh] sm:max-h-none">
                <span className="text-gray-400 font-medium">Report ID</span>
                <span className="text-white font-bold text-left sm:text-right">{activeReport.id}</span>
                
                <span className="text-gray-400 font-medium">Category</span>
                <span className="text-white font-semibold text-left sm:text-right">{activeReport.category}</span>
                
                <span className="text-gray-400 font-medium">Location</span>
                <span className="text-white font-medium text-left sm:text-right truncate">{activeReport.location.village || activeReport.location.district}, {activeReport.location.state}</span>
                
                <span className="text-gray-400 font-medium">Submitted On</span>
                <span className="text-white font-medium text-left sm:text-right">{new Date(activeReport.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                
                <span className="text-gray-400 font-medium self-start">Submitted By</span>
                <div className="flex items-center gap-2 justify-start sm:justify-end min-w-0">
                  <div className="text-left sm:text-right min-w-0">
                    <p className="text-white font-bold text-xs">{activeReport.agentName}</p>
                    <p className="text-gray-400 text-[10px]">{activeReport.agentId}</p>
                  </div>
                  <img src={avatar(activeReport.agentName)} alt={activeReport.agentName}
                    className="w-6 h-6 rounded-full border border-white/10" />
                </div>
                
                <span className="text-gray-400 font-medium">Urgency</span>
                <span className={`font-bold flex items-center gap-1.5 justify-start sm:justify-end ${activeReport.urgency==='High' ? 'text-red-400' : activeReport.urgency==='Medium' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeReport.urgency==='High' ? 'bg-red-500' : activeReport.urgency==='Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {activeReport.urgency}
                </span>
                
                <span className="text-gray-400 font-medium">Budget</span>
                <span className="text-white font-bold text-xs text-left sm:text-right">{activeReport.estimatedBudget}</span>
                
                <span className="text-gray-400 font-medium">Beneficiaries</span>
                <span className="text-white font-medium text-left sm:text-right">{activeReport.beneficiaries?.families || 0} Families</span>
                
                <span className="text-gray-400 font-medium">Status</span>
                <span className={`font-bold text-left sm:text-right ${activeReport.status==='Approved' ? 'text-emerald-400' : activeReport.status==='Converted' ? 'text-purple-400' : 'text-[#b8860b]'}`}>
                  {activeReport.status}
                </span>
              </div>
            </div>

            {/* ── TAKE ACTION (includes timeline + action form) ── */}
            <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-lg flex-shrink-0 overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-xs font-bold text-white">Take Action</h3>
              </div>

              {/* 6-stage lifecycle timeline — interactive step selection with cascading gold checkmarks */}
              <div className="px-3.5 pt-3 pb-1">
                <p className="text-[10px] text-gray-400 font-semibold mb-2 flex items-center justify-between">
                  <span>LIFECYCLE STAGES</span>
                  <span className="text-[9px] text-[#b8860b]">Click circle to select stage</span>
                </p>
                {(() => {
                  const TIMELINE_STAGES: { label: string; statusTarget: string; humanDesc: string }[] = [
                    { label: "Submitted", statusTarget: "Pending Review", humanDesc: "Submitted" },
                    { label: "Assigned to Reviewer", statusTarget: "Under Review", humanDesc: "Under Review" },
                    { label: "Under Review", statusTarget: "Under Review", humanDesc: "Under Review" },
                    { label: "Verification Visit", statusTarget: "Scheduled", humanDesc: "Verification Visit (Scheduled)" },
                    { label: "Approval", statusTarget: "Approved", humanDesc: "Approved" },
                    { label: "Published on Website", statusTarget: "Converted", humanDesc: "Converted to Cause" },
                  ];

                  const STAGE_MAX_INDEX: Record<string, number> = {
                    "Pending Review": 0,
                    "Under Review": 2,
                    "Needs Info": 2,
                    "Scheduled": 3,
                    "Approved": 4,
                    "Converted": 5,
                  };

                  const savedStages: Record<string, string> = (activeReport as any).timelineStages || {};
                  const activeMaxIndex = STAGE_MAX_INDEX[activeReport.status] ?? 0;
                  const selectedMaxIndex = takeActionStatus ? (STAGE_MAX_INDEX[takeActionStatus] ?? -1) : -1;
                  const effectiveMaxIndex = Math.max(activeMaxIndex, selectedMaxIndex);

                  const timelineSteps = TIMELINE_STAGES.map(({ label, statusTarget, humanDesc }, i) => {
                    const completedAt = label === "Submitted" ? activeReport.createdAt : savedStages[label];
                    const isDone = !!completedAt || effectiveMaxIndex >= i;
                    return { label, statusTarget, humanDesc, done: isDone, date: completedAt };
                  });

                  return (
                    <div className="space-y-0 pl-1">
                      {timelineSteps.map((step, i) => {
                        const isCurrent = !step.done && effectiveMaxIndex === i - 1;
                        const isSelected = takeActionStatus === step.statusTarget;

                        return (
                          <div
                            key={i}
                            onClick={() => {
                              if (step.label === "Published on Website" && activeReport.status === "Approved") {
                                handleConvert();
                              } else {
                                setTakeActionStatus(step.statusTarget);
                              }
                            }}
                            className={`flex gap-3 p-1.5 -ml-1 rounded-lg cursor-pointer transition-all duration-200 group ${
                              isSelected
                                ? "bg-[#b8860b]/15 ring-1 ring-[#b8860b]/40"
                                : "hover:bg-white/[0.04]"
                            }`}
                            title={`Click to set status to ${step.humanDesc}`}
                          >
                            <div className="flex flex-col items-center">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200 group-hover:scale-110 ${
                                step.done
                                  ? "border-[#b8860b] bg-[#b8860b]/20"
                                  : isSelected
                                  ? "border-emerald-400 bg-emerald-500/30 ring-4 ring-emerald-500/20"
                                  : isCurrent
                                  ? "border-[#b8860b] bg-[#b8860b]/10 animate-pulse"
                                  : "border-white/20 bg-transparent group-hover:border-white/50"
                              }`}>
                                {step.done ? (
                                  <CheckCircle className="w-3 h-3 text-[#b8860b]" />
                                ) : isSelected ? (
                                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                ) : isCurrent ? (
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#b8860b]" />
                                ) : null}
                              </div>
                              {i < timelineSteps.length - 1 && (
                                <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${
                                  step.done || effectiveMaxIndex > i ? "bg-[#b8860b]" : "bg-white/10"
                                }`} />
                              )}
                            </div>
                            <div className="pb-3 flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <p className={`text-sm font-medium transition ${
                                  step.done
                                    ? "text-white font-semibold"
                                    : isSelected
                                    ? "text-emerald-400 font-bold"
                                    : isCurrent
                                    ? "text-[#b8860b]"
                                    : "text-gray-400 group-hover:text-gray-200"
                                }`}>{step.label}</p>
                                {isSelected && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SELECTED</span>
                                )}
                              </div>
                              {step.done && step.date ? (
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  {new Date(step.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                              ) : step.done ? (
                                <p className="text-[10px] text-[#b8860b]/80 mt-0.5">Completed</p>
                              ) : isCurrent ? (
                                <p className="text-[10px] text-[#b8860b]/70 mt-0.5">In Progress</p>
                              ) : (
                                <p className="text-[10px] text-gray-600 mt-0.5">Click circle to select</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Action form — only shown for non-Converted/non-Published reports */}
              {!['Converted'].includes(activeReport.status) && (
                <div className="px-3.5 pb-3 flex flex-col gap-2.5 border-t border-white/[0.06] pt-3 mt-1">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">Change Status To</label>
                    <select
                      value={takeActionStatus}
                      onChange={e => setTakeActionStatus(e.target.value)}
                      className="w-full bg-[#0d1410] border border-white/[0.1] text-white text-xs rounded-md px-2.5 py-2 focus:outline-none focus:border-emerald-500/40 cursor-pointer"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="" className="bg-[#0a0d0b] text-gray-400">— Select new status —</option>
                      {activeReport.status !== 'Under Review'   && <option value="Under Review"   className="bg-[#0a0d0b] text-white">Under Review</option>}
                      {activeReport.status !== 'Needs Info'     && !['Approved','Rejected'].includes(activeReport.status) && <option value="Needs Info"     className="bg-[#0a0d0b] text-white">Needs Info</option>}
                      {activeReport.status !== 'Scheduled'      && !['Approved','Rejected'].includes(activeReport.status) && <option value="Scheduled"      className="bg-[#0a0d0b] text-white">Scheduled (Verification Visit)</option>}
                      {activeReport.status !== 'Approved'       && activeReport.status !== 'Rejected' && <option value="Approved"       className="bg-[#0a0d0b] text-white">Approved ✅</option>}
                      {activeReport.status !== 'Rejected'       && !['Approved','Converted'].includes(activeReport.status) && <option value="Rejected"       className="bg-[#0a0d0b] text-white">Rejected ❌</option>}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">Admin Notes <span className="normal-case text-gray-600">(optional)</span></label>
                    <textarea
                      value={takeActionNotes}
                      onChange={e => setTakeActionNotes(e.target.value)}
                      placeholder="Add a note for the field agent..."
                      rows={2}
                      className="w-full bg-[#0d1410] border border-white/[0.1] text-white text-xs rounded-md px-2.5 py-2 focus:outline-none focus:border-emerald-500/40 resize-none placeholder:text-gray-600"
                    />
                  </div>
                  <button
                    onClick={handleTakeAction}
                    disabled={!takeActionStatus || takeActionLoading}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                      takeActionSuccess
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                        : takeActionStatus && !takeActionLoading
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                        : 'bg-white/[0.04] border border-white/[0.06] text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {takeActionLoading ? (
                      <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Updating...</>
                    ) : takeActionSuccess ? (
                      <><CheckCircle className="w-3.5 h-3.5" />Status Updated!</>
                    ) : (
                      'Confirm Action'
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex-shrink-0 min-w-0">
              <p className="text-xs font-bold text-white mb-1.5 ml-0.5">Quick Actions</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 min-w-0">
                {([
                  {
                    label: 'Approve', Icon: CheckCircle, hc: 'emerald',
                    fn: handleApprove,
                    disabled: ['Approved','Converted'].includes(activeReport.status),
                  },
                  {
                    label: 'Request Info', Icon: HelpCircle, hc: 'amber',
                    fn: () => { setRequestInfoText(''); setShowRequestInfoModal(true); },
                    disabled: ['Approved','Converted','Rejected'].includes(activeReport.status),
                  },
                  {
                    label: 'Reject', Icon: X, hc: 'red',
                    fn: () => { setRejectReason(''); setShowRejectModal(true); },
                    disabled: ['Approved','Converted','Rejected'].includes(activeReport.status),
                  },
                  {
                    label: 'Assign', Icon: UserPlus, hc: 'blue',
                    fn: () => { setAssignTo(activeReport.assignedAdminId || ''); setShowAssignModal(true); },
                    disabled: ['Converted'].includes(activeReport.status),
                  },
                  {
                    label: 'Convert to Cause', Icon: Sparkles, hc: 'purple',
                    fn: handleConvert,
                    disabled: activeReport.status !== 'Approved',
                  },
                ] as { label:string; Icon:any; hc:string; fn:()=>void; disabled:boolean }[]).map(({ label, Icon, hc, fn, disabled }) => (
                  <button key={label} onClick={disabled ? undefined : fn} disabled={disabled}
                    className={`flex flex-col items-center justify-center gap-1 group p-2 rounded-lg border border-white/[0.08] bg-[#0a0d0b] transition-all ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-white/[0.04]'}`}>
                    <div className={`text-gray-400 transition ${!disabled ? `group-hover:text-${hc}-400` : ''}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] text-gray-300 group-hover:text-white text-center font-medium leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>


            </div>{/* end scrollable wrapper */}
          </div>
        ) : activeAgent ? (
          /* Agent profile when no report or Operational Conversation selected */
          <div className={`${(mobileView === 'details' || showTabletDetails) ? 'flex' : 'hidden'} xl:flex absolute xl:static inset-y-0 right-0 z-40 xl:z-auto w-full xl:w-auto bg-[#020704]/95 xl:bg-transparent backdrop-blur-xl xl:backdrop-blur-none border-l xl:border-none border-white/[0.07] p-3 xl:p-0 flex-shrink-0 flex-col gap-3 h-full shadow-2xl xl:shadow-none min-w-0 min-h-0`}>
            
            {/* Mobile/Tablet Close Button */}
            <div className="xl:hidden flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-white">Agent Info</h3>
              <button onClick={() => { setShowTabletDetails(false); setMobileView('chat'); }} className="p-1.5 bg-white/[0.05] rounded-md text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-lg p-4 flex flex-col gap-3 flex-1">
              <h3 className="text-xs font-bold text-white hidden xl:block">Agent Profile</h3>
              <div className="flex flex-col items-center text-center py-2">
                <img src={avatar(activeAgent.name, activeAgent.avatarUrl)} alt={activeAgent.name}
                  className="w-14 h-14 rounded-full border-2 border-emerald-500/30 mb-2" />
                <h4 className="text-sm font-bold text-white">{activeAgent.name}</h4>
                <p className="text-xs text-gray-400 mt-0.5">{activeAgent.role} · {activeAgent.region}</p>
                <span className="mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{activeAgent.status}</span>
              </div>
              <div className="space-y-2.5 text-xs">
                {([['Email', activeAgent.email], ['Phone', activeAgent.phone], ['District', activeAgent.district], ['Joined', activeAgent.joinDate ? new Date(activeAgent.joinDate).toLocaleDateString() : '—']] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-start gap-2">
                    <span className="text-gray-400 flex-shrink-0">{k}</span>
                    <span className="text-white font-medium text-right truncate max-w-[120px]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden xl:block flex-shrink-0" />
        )}
      </div>
    </div>

    {/* ── AI INSIGHTS MODAL ── */}
    {showAIInsights && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-[#0a0f0c] border border-emerald-500/20 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-emerald-900/20">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white">AI Operational Insights</h3>
                <p className="text-xs text-gray-400 mt-0.5">Generated from live field operations data</p>
              </div>
            </div>
            <button onClick={() => setShowAIInsights(false)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/[0.05] rounded-lg transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-7 h-7 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                <p className="text-xs text-gray-400">Analyzing operational data...</p>
              </div>
            ) : (
              aiInsights.split('\n\n').filter(Boolean).map((bullet, i) => {
                const boldMatch = bullet.match(/^\*\*(.+?)\*\*:?\s*([\s\S]*)$/);
                return (
                  <div key={i} className="flex gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-emerald-400">{i+1}</span>
                    </div>
                    <div className="flex-1">
                      {boldMatch ? (
                        <>
                          <p className="text-xs font-bold text-white mb-0.5">{boldMatch[1]}</p>
                          <p className="text-xs text-gray-300 leading-relaxed">{boldMatch[2]}</p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-300 leading-relaxed">{bullet}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-xs text-gray-400">Based on {allReports.length} reports · {agents.length} agents · {conversations.length} conversations</p>
            <button onClick={handleAIInsights} disabled={aiLoading} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-40 flex items-center gap-1.5 transition">
              <Sparkles className="w-3.5 h-3.5" /> Regenerate
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── REJECT MODAL ── */}
    {showRejectModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
        <div className="bg-[#0a0f0c] border border-red-500/20 rounded-md w-full max-w-md shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-red-900/20">
            <div className="flex items-center gap-2">
              <X className="w-4 h-4 text-red-400" />
              <div>
                <h3 className="text-[10.5px] font-bold text-white">Reject Report</h3>
                <p className="text-[8px] text-gray-400 mt-0">Provide a clear reason for the agent</p>
              </div>
            </div>
            <button onClick={() => setShowRejectModal(false)} className="p-1 text-gray-500 hover:text-white hover:bg-white/[0.05] rounded-md transition">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[8.5px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5 block">Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Explain why this report is being rejected and what the agent can do to resubmit..."
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2.5 py-2 text-[9px] text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500/40 resize-none"
              />
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2 text-[9px] font-bold text-gray-400 border border-white/[0.08] rounded-md hover:bg-white/[0.03] transition">
                Cancel
              </button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || actionLoading}
                className="flex-1 py-2 text-[9px] font-bold text-white bg-red-600/80 hover:bg-red-600 border border-red-500/30 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                {actionLoading && <div className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── REQUEST INFO MODAL ── */}
    {showRequestInfoModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
        <div className="bg-[#0a0f0c] border border-amber-500/20 rounded-md w-full max-w-md shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-amber-900/20">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-[10.5px] font-bold text-white">Request More Information</h3>
                <p className="text-[8px] text-gray-400 mt-0">Agent will be notified via conversation</p>
              </div>
            </div>
            <button onClick={() => setShowRequestInfoModal(false)} className="p-1 text-gray-500 hover:text-white hover:bg-white/[0.05] rounded-md transition">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[8.5px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5 block">What information is needed? *</label>
              <textarea
                value={requestInfoText}
                onChange={e => setRequestInfoText(e.target.value)}
                rows={4}
                placeholder="Describe what additional information, documents, or photos you need from the agent..."
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2.5 py-2 text-[9px] text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
              />
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setShowRequestInfoModal(false)} className="flex-1 py-2 text-[9px] font-bold text-gray-400 border border-white/[0.08] rounded-md hover:bg-white/[0.03] transition">
                Cancel
              </button>
              <button onClick={handleRequestInfo} disabled={!requestInfoText.trim() || actionLoading}
                className="flex-1 py-2 text-[9px] font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-400/30 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                {actionLoading && <div className="w-2.5 h-2.5 rounded-full border-2 border-black border-t-transparent animate-spin" />}
                Send Request
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── ASSIGN MODAL ── */}
    {showAssignModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
        <div className="bg-[#0a0f0c] border border-blue-500/20 rounded-md w-full max-w-md shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-blue-900/20">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-400" />
              <div>
                <h3 className="text-[10.5px] font-bold text-white">Assign Reviewer</h3>
                <p className="text-[8px] text-gray-400 mt-0">Report will move to "Under Review"</p>
              </div>
            </div>
            <button onClick={() => setShowAssignModal(false)} className="p-1 text-gray-500 hover:text-white hover:bg-white/[0.05] rounded-md transition">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[8.5px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5 block">Assign To *</label>
              <div className="space-y-1.5">
                {([
                  { id: 'Admin_1', name: 'Ahmed Khan', role: 'Field Supervisor' },
                  { id: 'Admin_2', name: 'Fatima Malik', role: 'Regional Coordinator' },
                  { id: 'Admin_3', name: 'Omar Rashid', role: 'Senior Reviewer' },
                ] as { id: string; name: string; role: string }[]).map(admin => (
                  <button key={admin.id} onClick={() => setAssignTo(admin.id)}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-md border transition text-left ${
                      assignTo === admin.id
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
                    }`}>
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[8.5px] font-bold text-blue-300 flex-shrink-0">
                      {admin.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-white">{admin.name}</p>
                      <p className="text-[8px] text-gray-500">{admin.role}</p>
                    </div>
                    {assignTo === admin.id && <CheckCircle className="w-3 h-3 text-blue-400 ml-auto" />}
                  </button>
                ))}
                <input
                  type="text"
                  value={assignTo}
                  onChange={e => setAssignTo(e.target.value)}
                  placeholder="Or type Admin ID manually..."
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2.5 py-2 text-[9px] text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/40"
                />
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setShowAssignModal(false)} className="flex-1 py-2 text-[9px] font-bold text-gray-400 border border-white/[0.08] rounded-md hover:bg-white/[0.03] transition">
                Cancel
              </button>
              <button onClick={handleAssign} disabled={!assignTo.trim() || actionLoading}
                className="flex-1 py-2 text-[9px] font-bold text-white bg-blue-600/80 hover:bg-blue-600 border border-blue-500/30 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                {actionLoading && <div className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                Assign Reviewer
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default function FieldOperationsCenter() {
  return (
    <Suspense fallback={
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
      </div>
    }>
      <FieldOperationsCenterContent />
    </Suspense>
  );
}
