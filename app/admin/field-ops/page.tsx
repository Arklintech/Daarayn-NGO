'use client';

import React, { useState, useEffect, Suspense } from "react";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, query, onSnapshot, doc, updateDoc, setDoc, where, addDoc } from "firebase/firestore";
import { 
  Search, FileText, CheckCircle, Clock, AlertCircle, MessageSquare, 
  Briefcase, X, HelpCircle, Sparkles, UserPlus, Send, Paperclip, 
  MoreHorizontal, Filter, ArrowLeft, Bell, Users, Mic, ChevronDown, Settings, Smile
} from "lucide-react";
import { FieldAgent, FieldReport, FieldMessage, FieldConversation } from "@/lib/db-field-ops";
import { notifyFieldReport, notifyConversation } from "@/lib/notifications";
import { useSearchParams } from "next/navigation";

function FieldOperationsCenterContent() {
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
  

  // Global Listeners
  useEffect(() => {
    const unsubA = onSnapshot(collection(db, "field_agents"), snap => {
      const list: FieldAgent[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as FieldAgent));
      setAgents(list);
    });
    const unsubR = onSnapshot(collection(db, "field_reports"), snap => {
      const list: FieldReport[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as FieldReport));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllReports(list);
    });
    const unsubC = onSnapshot(collection(db, "field_conversations"), snap => {
      const list: FieldConversation[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as FieldConversation));
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setConversations(list);
    });
    return () => { unsubA(); unsubR(); unsubC(); };
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

  // Load Messages for active conversation
  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }
    const q = query(collection(db, "field_messages"), where("conversationId", "==", activeConvId));
    const unsub = onSnapshot(q, snap => {
      const list: FieldMessage[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as FieldMessage));
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(list);
      
      // Mark as read by admin
      updateDoc(doc(db, "field_conversations", activeConvId), { unreadCountAdmin: 0 }).catch(() => {});
    });
    return () => unsub();
  }, [activeConvId]);

  const activeAgent = agents.find(a => a.id === activeAgentId);
  const activeConv = conversations.find(c => c.id === activeConvId);
  const activeReport = activeConv?.reportId 
    ? allReports.find(r => r.id === activeConv?.reportId) 
    : (activeAgentId ? allReports.find(r => r.agentId === activeAgentId) : null);
  
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
    if (!newMessage.trim() || !activeConvId || !activeAgent) return;
    try {
      const msg: Omit<FieldMessage, "id"> = {
        conversationId: activeConvId, 
        senderId: "Admin_1", // Replace with real auth
        senderRole: "Admin",
        senderName: "Ahmed Khan", // Replace with real auth name
        text: newMessage, 
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(db, "field_messages"), msg);
      
      await updateDoc(doc(db, "field_conversations", activeConvId), {
        lastMessage: {
          text: newMessage,
          timestamp: new Date().toISOString(),
          senderRole: "Admin"
        },
        unreadCountAgent: 1, 
        updatedAt: new Date().toISOString(),
        status: "Waiting For Field Agent"
      });
      setNewMessage("");
    } catch (err) { console.error(err); }
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
      let fileUrl = "";
      try {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${timestamp}_${safeName}`;
        const storageRef = ref(storage, `communications/${filename}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      } catch (uploadErr) {
        console.error("Firebase Storage upload failed", uploadErr);
        throw new Error("Failed to upload file to storage.");
      }

      const isImage = file.type.startsWith("image/");

      const msg: any = {
        conversationId: activeConvId,
        senderId: "Admin_1",
        senderRole: "Admin",
        senderName: "Ahmed Khan",
        text: `📎 ${file.name}`,
        isMedia: true,
        mediaBase64: fileUrl,
        mediaType: file.type,
        mediaName: file.name,
        isImage,
        timestamp: new Date().toISOString()
      };

      await addDoc(collection(db, "field_messages"), msg);

      await updateDoc(doc(db, "field_conversations", activeConvId), {
        lastMessage: {
          text: `📎 ${file.name}`,
          timestamp: new Date().toISOString(),
          senderRole: "Admin"
        },
        unreadCountAgent: 1,
        updatedAt: new Date().toISOString(),
        status: "Waiting For Field Agent"
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
        let audioUrl = "";
        try {
          const timestamp = Date.now();
          const filename = `${timestamp}_VoiceNote.webm`;
          const storageRef = ref(storage, `communications/${filename}`);
          const audioFile = new File([audioBlob], "VoiceNote.webm", { type: "audio/webm" });
          await uploadBytes(storageRef, audioFile);
          audioUrl = await getDownloadURL(storageRef);
        } catch (uploadErr) {
          console.error("Firebase Storage voice note upload failed", uploadErr);
          alert("Failed to upload voice note.");
          return;
        }

        const msg: any = {
          conversationId: activeConvId,
          senderId: "Admin_1",
          senderRole: "Admin",
          senderName: "Ahmed Khan",
          text: "🎤 Voice Note",
          isMedia: true,
          mediaBase64: audioUrl,
          mediaType: "audio/webm",
          mediaName: "VoiceNote.webm",
          timestamp: new Date().toISOString()
        };

        await addDoc(collection(db, "field_messages"), msg);

        await updateDoc(doc(db, "field_conversations", activeConvId), {
          lastMessage: {
            text: "🎤 Voice Note",
            timestamp: new Date().toISOString(),
            senderRole: "Admin"
          },
          unreadCountAgent: 1,
          updatedAt: new Date().toISOString(),
          status: "Waiting For Field Agent"
        });
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
      await updateDoc(doc(db, "field_reports", activeReport.id), {
        status: "Approved",
        updatedAt: new Date().toISOString(),
      });
      await notifyFieldReport.approved(activeReport.id, activeReport.agentId, activeReport.title);
      // Post system message to agent's conversation
      const conv = conversations.find(c => c.reportId === activeReport.id);
      if (conv) {
        await addDoc(collection(db, "field_messages"), {
          conversationId: conv.id, senderId: "System", senderRole: "System",
          senderName: "System", text: `✅ Your report "${activeReport.title}" has been approved.`,
          timestamp: new Date().toISOString(), readByAgent: false, readByAdmin: true,
        });
        await updateDoc(doc(db, "field_conversations", conv.id), {
          lastMessage: { text: `✅ Report Approved`, timestamp: new Date().toISOString(), senderRole: "System" },
          unreadCountAgent: 1, updatedAt: new Date().toISOString(),
        });
      }
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!activeReport || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "field_reports", activeReport.id), {
        status: "Rejected", adminNotes: rejectReason.trim(),
        updatedAt: new Date().toISOString(),
      });
      await notifyFieldReport.rejected(activeReport.id, activeReport.agentId, activeReport.title);
      const conv = conversations.find(c => c.reportId === activeReport.id);
      if (conv) {
        await addDoc(collection(db, "field_messages"), {
          conversationId: conv.id, senderId: "System", senderRole: "System",
          senderName: "System",
          text: `❌ Your report "${activeReport.title}" was not approved.\n\nReason: ${rejectReason.trim()}`,
          timestamp: new Date().toISOString(), readByAgent: false, readByAdmin: true,
        });
        await updateDoc(doc(db, "field_conversations", conv.id), {
          lastMessage: { text: `❌ Report Rejected`, timestamp: new Date().toISOString(), senderRole: "System" },
          unreadCountAgent: 1, updatedAt: new Date().toISOString(),
        });
      }
      setShowRejectModal(false);
      setRejectReason('');
    } finally { setActionLoading(false); }
  };

  const handleRequestInfo = async () => {
    if (!activeReport || !requestInfoText.trim()) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "field_reports", activeReport.id), {
        status: "Needs Info", adminNotes: requestInfoText.trim(),
        updatedAt: new Date().toISOString(),
      });
      const conv = conversations.find(c => c.reportId === activeReport.id);
      if (conv) {
        await addDoc(collection(db, "field_messages"), {
          conversationId: conv.id, senderId: "Admin_1", senderRole: "Admin",
          senderName: "Ahmed Khan",
          text: `ℹ️ Additional information needed for your report "${activeReport.title}":\n\n${requestInfoText.trim()}`,
          timestamp: new Date().toISOString(), readByAgent: false, readByAdmin: true,
        });
        await updateDoc(doc(db, "field_conversations", conv.id), {
          lastMessage: { text: `ℹ️ Info Requested`, timestamp: new Date().toISOString(), senderRole: "Admin" },
          unreadCountAgent: 1, status: "Waiting For Field Agent", updatedAt: new Date().toISOString(),
        });
      }
      setShowRequestInfoModal(false);
      setRequestInfoText('');
    } finally { setActionLoading(false); }
  };

  const handleAssign = async () => {
    if (!activeReport || !assignTo.trim()) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, "field_reports", activeReport.id), {
        assignedAdminId: assignTo.trim(),
        status: activeReport.status === "Pending Review" ? "Under Review" : activeReport.status,
        updatedAt: new Date().toISOString(),
      });
      const conv = conversations.find(c => c.reportId === activeReport.id);
      if (conv) {
        await updateDoc(doc(db, "field_conversations", conv.id), {
          assignedAdminId: assignTo.trim(), updatedAt: new Date().toISOString(),
        });
      }
      setShowAssignModal(false);
      setAssignTo('');
    } finally { setActionLoading(false); }
  };

  const handleConvert = async () => {
    if (!activeReport) return;
    const causeId = `CUSE-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    await setDoc(doc(db, "causes", causeId), {
      id: causeId, title: activeReport.title, description: activeReport.description,
      category: activeReport.category, goalAmount: parseInt(activeReport.estimatedBudget.replace(/[^0-9]/g, '')) || 0,
      amountCollected: 0, currency: "INR", startDate: new Date().toISOString().split("T")[0],
      status: "Draft", images: activeReport.media || [], originReportId: activeReport.id,
      originAgentId: activeReport.agentId, location: `${activeReport.location.village}, ${activeReport.location.district}`,
      beneficiariesCount: activeReport.beneficiaries?.families || 0, createdAt: new Date().toISOString()
    });
    await updateDoc(doc(db, "field_reports", activeReport.id), { status: "Converted", convertedCauseId: causeId, updatedAt: new Date().toISOString() });
    await notifyFieldReport.converted(activeReport.id, causeId, activeReport.title);
    alert(`✅ Cause Draft created! ID: ${causeId}`);
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

      // Try AI API first
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `You are an AI analyst for Daarayn, a humanitarian NGO. Analyze this operational data and give 5 actionable bullet points for the admin. Be concise and specific.\n\nData: ${JSON.stringify({ agents: agents.length, activeAgents: agents.filter(a=>a.status==='Active').length, totalReports: allReports.length, pending, urgent, unread, suspended, topCategory: topCat?.[0], conversionRate: convRate+'%' })}`
          }]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.message || data.content || data.choices?.[0]?.message?.content;
        if (text) { setAiInsights(text); setAiLoading(false); return; }
      }
    } catch (_) {}

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
      <div className="flex flex-col h-full w-full bg-[#020704] text-gray-200 overflow-hidden p-1.5 md:p-3">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between flex-shrink-0 mb-0.5 gap-2.5 min-w-0">
        <div>
          <h1 className="text-[12px] font-bold text-white tracking-wide leading-none">Field Operations Center</h1>
          <p className="text-[8.5px] text-gray-400 mt-0">Manage field reports, communicate with field agents and track progress.</p>
        </div>
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <input type="text" placeholder="Search reports, agents, locations..."
              className="w-full bg-black/40 border border-white/[0.08] rounded-md pl-6 pr-9 py-0.5 text-[8.5px] text-white focus:outline-none focus:border-white/20 placeholder:text-gray-500" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
              <kbd className="bg-white/[0.05] border border-white/[0.1] rounded px-0.5 py-0 text-[8px] text-gray-400">⌘</kbd>
              <kbd className="bg-white/[0.05] border border-white/[0.1] rounded px-0.5 py-0 text-[8px] text-gray-400">K</kbd>
            </div>
          </div>
          <button onClick={handleAIInsights} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-md text-[8px] font-bold flex items-center gap-0.5 hover:bg-emerald-500/20 active:scale-95 transition">
            <Sparkles className="w-2.5 h-2.5" /> AI Insights
          </button>
          <button className="relative p-1 text-gray-400 hover:text-white transition">
            <Bell className="w-3 h-3" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 border border-[#020704] rounded-full" />
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="flex md:grid md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-1 mb-1 flex-shrink-0 min-w-0 overflow-x-auto md:overflow-visible custom-scrollbar pb-1.5 md:pb-0 snap-x">
        {([
          { label:'Field Agents',        value: agents.length || 182, sub:'Active',           color:'blue',   Icon: Users },
          { label:'Total Reports',       value: allReports.length || 2842, sub:'All Time',    color:'emerald',Icon: FileText },
          { label:'Pending Review',      value: pendingCount || 21,   sub:'Needs Attention',  color:'amber',  Icon: Clock },
          { label:'Unread Messages',     value: totalUnread,          sub:'Requires Reply',   color:'red',    Icon: MessageSquare },
          { label:'Urgent Reports',      value: urgentCount || 3,     sub:'High Priority',    color:'red',    Icon: AlertCircle },
          { label:'Verified & Approved', value: verifiedCount || 1256,sub:'This Year',        color:'emerald',Icon: CheckCircle },
        ] as const).map(({ label, value, sub, color, Icon }) => (
          <div key={label} className={`shrink-0 md:shrink md:snap-none snap-start min-w-[140px] md:min-w-[79px] lg:min-w-0 bg-[#0a0d0b] border rounded-md p-1 flex items-center gap-1 ${color === 'amber' ? 'border-[#b8860b]/30' : 'border-white/[0.07]'}`}>
            <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
              color==='blue'   ? 'bg-blue-500/10 text-blue-400' :
              color==='emerald'? 'bg-emerald-500/10 text-emerald-400' :
              color==='amber'  ? 'bg-[#b8860b]/10 text-[#b8860b]' :
                                 'bg-red-500/10 text-red-400'
            }`}>
              <Icon className="w-2.5 h-2.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] text-gray-400 truncate leading-none mb-0">{label}</p>
              <div className="flex items-baseline gap-0.5 overflow-hidden leading-none">
                <span className="text-[10px] font-bold text-white truncate">{value.toLocaleString()}</span>
                <span className={`text-[8px] font-semibold truncate ${
                  color==='blue' ? 'text-blue-400' : color==='emerald' ? 'text-emerald-400' :
                  color==='amber' ? 'text-[#b8860b]' : 'text-red-400'
                }`}>{sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3-COLUMN BODY ── */}
      <div className="flex flex-col md:grid md:grid-cols-[minmax(240px,25%)_minmax(0,1fr)] xl:grid-cols-[minmax(240px,22%)_minmax(400px,1fr)_minmax(240px,24%)] gap-1 md:gap-2 flex-1 min-w-0 w-full min-h-0 overflow-hidden relative">

        {/* LEFT: Agent List */}
        <div className={`${mobileView === 'agents' ? 'flex' : 'hidden'} md:flex h-full flex-shrink-0 bg-[#0a0d0b] border border-white/[0.07] rounded-md flex-col overflow-hidden min-w-0 min-h-0`}>
          <div className="p-2.5 border-b border-white/[0.06]">
            <p className="text-[11.5px] font-bold text-white mb-1.5">Field Agents & Conversations</p>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-500" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full bg-black/40 border border-white/[0.08] rounded-md pl-6 pr-2.5 py-1 text-[8.5px] text-white focus:outline-none focus:border-white/20" />
              </div>
              <button className="p-1 border border-white/[0.08] rounded-md bg-black/30 text-gray-400 hover:text-white transition">
                <Filter className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0">
            {filteredAgents.length === 0 && (
              <p className="text-center text-gray-600 text-[8.5px] py-6">No agents found</p>
            )}
            {filteredAgents.map(agent => {
              const isActive = activeAgentId === agent.id;
              
              // Get all conversations for this agent
              const agentConvs = conversations.filter(c => c.agentId === agent.id);
              const unreadConvs = agentConvs.filter(c => c.unreadCountAdmin > 0).length;
              const hasActiveReports = allReports.filter(r => r.agentId === agent.id && ['Pending Review', 'Needs Info'].includes(r.status)).length > 0;
              
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
                  className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-all ${
                    isActive ? 'bg-emerald-950/50 border border-emerald-800/40' : 'hover:bg-white/[0.03] border border-transparent'
                  }`}>
                  <div className="relative flex-shrink-0">
                    <img src={avatar(agent.name, agent.avatarUrl)} alt={agent.name}
                      className="w-8 h-8 rounded-full object-cover border border-white/10" />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0a0d0b] ${bgClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white truncate">{agent.name}</p>
                    <p className="text-[8.5px] text-gray-500 truncate">{agent.city || agent.district}, {agent.state}</p>
                    <p className={`text-[8px] mt-0 font-medium ${dotColorClass}`}>• {statusLabel}</p>
                  </div>
                  {badgeText === '✓' ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[8px] flex items-center justify-center flex-shrink-0">✓</span>
                  ) : (
                    <span className={`w-4 h-4 rounded-full ${bgClass} text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0`}>
                      {badgeText}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Button */}
          <div className="p-3 border-t border-white/[0.06] bg-[#0a0d0b] mt-auto">
            <button className="w-full py-2 rounded-md bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/30 text-emerald-100 text-[9px] font-bold transition text-center">
              View All Agents
            </button>
          </div>
        </div>

        {/* MIDDLE: Conversation Panel */}
        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 bg-[#0a0d0b] border border-white/[0.07] rounded-md flex-col overflow-hidden min-w-0 min-h-0 h-full`}>

          {!activeAgentId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-11 h-11 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-[10px] font-semibold text-white">Central Communication Hub</p>
              <p className="text-[8.5px] text-gray-400 mt-1.5">Select an agent to view their conversations.</p>
              <button className="md:hidden mt-3 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold rounded-md border border-emerald-500/20" onClick={() => setMobileView('agents')}>
                View Agents
              </button>
            </div>

          ) : !activeConvId ? (
            /* Agent selected, but no conversation exists yet */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#06090a]">
              <div className="w-11 h-11 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-[10px] font-semibold text-gray-300 mb-1">No conversations yet</p>
              <p className="text-[8.5px] text-gray-500 max-w-[124px]">Wait for the agent to submit a report or start an operations conversation.</p>
            </div>

          ) : (
            /* Active Conversation Selected */
            <>
              {/* Conversation Header & Switcher */}
              <div className="px-3 pt-2.5 pb-0 border-b border-white/[0.06] flex-shrink-0">
                
                {/* Rich Header for Reports */}
                {activeConv?.type === 'Report' && activeReport ? (
                  <>
                    <div className="flex items-start justify-between gap-2.5 mb-1.5">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2.5">
                          <button onClick={() => { setActiveAgentId(null); setMobileView('agents'); }} className="text-gray-400 hover:text-white transition flex-shrink-0">
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <h2 className="text-[13.5px] font-extrabold text-white">Report: {activeReport.id}</h2>
                          <span className="px-1.5 py-0 rounded-md text-[8px] font-bold border flex-shrink-0 bg-[#b8860b]/10 text-[#b8860b] border-[#b8860b]/30">
                            {activeReport.status}
                          </span>
                        </div>
                        <p className="text-[8px] text-gray-400 mt-0.5 ml-5 truncate">
                          {activeReport.category} Roof Repair • {activeReport.location.village || activeReport.location.district}, {activeReport.location.state} • Submitted by {activeReport.agentName}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/[0.08] hover:bg-white/[0.05] transition text-[8px] text-gray-300 font-medium">
                          <UserPlus className="w-2.5 h-2.5" /> Assign
                        </button>
                        <button className="p-0.5 rounded-md border border-white/[0.08] hover:bg-white/[0.05] transition text-gray-300">
                          <MoreHorizontal className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Tabs */}
                    <div className="flex gap-4 mt-2 ml-5 overflow-x-auto no-scrollbar">
                      {['Conversation','Details',`Media (${activeReport.media?.length || 0})`,`Documents (0)`,'History'].map(tab => {
                        const key = tab.split(' ')[0];
                        return (
                          <button key={tab} onClick={() => setActiveTab(key)}
                            className={`pb-1.5 text-[8.5px] font-medium border-b-2 transition whitespace-nowrap ${
                              activeTab === key ? 'border-emerald-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}>{tab}</button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Standard Header for General Chat */
                  <div className="flex items-start justify-between gap-2.5 pb-1.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <button onClick={() => { setActiveAgentId(null); setMobileView('agents'); }} className="mt-0.5 text-gray-400 hover:text-white transition flex-shrink-0 lg:hidden">
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h2 className="text-[13.5px] font-extrabold text-white">Operations Support</h2>
                          <span className="px-1.5 py-0 rounded text-[8px] font-bold border flex-shrink-0 bg-purple-500/10 text-purple-400 border-purple-500/30">
                            General Chat
                          </span>
                        </div>
                        <p className="text-[8.5px] text-gray-400 mt-0.5 truncate">
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
              <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-5 text-gray-600 text-[8.5px]">No messages yet — start the conversation.</div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className="flex gap-2.5 p-3 rounded-md border border-white/[0.04] bg-[#0c100d] max-w-full">
                    <img src={avatar(msg.senderName)} alt={msg.senderName}
                      className="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-white">{msg.senderName}</span>
                        <span className={`text-[8px] font-semibold px-1.5 py-0 rounded-full ${
                          msg.senderRole==='Admin' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                        }`}>{msg.senderRole}</span>
                        <span className="text-[8px] text-gray-500 ml-1.5">{new Date(msg.timestamp).toLocaleString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' })}</span>
                        <MoreHorizontal className="w-3 h-3 text-gray-600 ml-auto cursor-pointer hover:text-gray-300 transition" />
                      </div>
                      <div className="text-[9.5px] text-gray-300 leading-relaxed pr-3">
                        {(msg as any).isMedia ? (
                          <div className="flex flex-col gap-1.5 mt-1.5">
                            {(msg as any).isImage && (msg as any).mediaBase64 ? (
                              <img src={(msg as any).mediaBase64} alt={(msg as any).mediaName || 'Image'} className="max-w-full max-h-64 rounded-md object-cover border border-white/10 cursor-pointer" onClick={() => window.open((msg as any).mediaBase64, '_blank')} />
                            ) : (msg as any).mediaType?.startsWith("audio/") ? (
                              <audio src={(msg as any).mediaBase64} controls className="max-w-full rounded-md outline-none" />
                            ) : (msg as any).mediaBase64 ? (
                              <a href={(msg as any).mediaBase64} download={(msg as any).mediaName || 'attachment'} className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span>{(msg as any).mediaName || 'Download File'}</span>
                              </a>
                            ) : (msg as any).mediaUrls?.length > 0 ? (
                              (msg as any).mediaUrls.map((url: string, i: number) => (
                                (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) ? (
                                  <img key={i} src={url} alt="Attachment" className="max-w-full max-h-64 rounded-md object-cover border border-white/10" />
                                ) : (
                                  <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-emerald-400 underline">
                                    <FileText className="w-3 h-3" /> View Attachment
                                  </a>
                                )
                              ))
                            ) : null}
                            <span className="text-[8.5px] opacity-60 mt-0.5">{msg.text}</span>
                          </div>
                        ) : msg.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="px-3 py-2.5 bg-[#0a0d0b] flex-shrink-0">
                <form onSubmit={handleSend}
                  className="flex items-center gap-1.5 bg-[#0c100d] border border-white/[0.06] rounded-md px-2.5 py-1 focus-within:border-emerald-500/40 transition-colors">
                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 bg-transparent text-[10px] text-white focus:outline-none placeholder:text-gray-600 py-1" />
                  <div className="flex items-center gap-0.5 text-gray-500">
                    <label className={`p-1.5 hover:text-white rounded-md hover:bg-white/[0.05] transition cursor-pointer flex items-center justify-center ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      {isUploading ? (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-white animate-spin" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5" />
                      )}
                      <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx" disabled={isUploading} />
                    </label>
                    <button type="button" className="p-1.5 rounded-md hover:text-white hover:bg-white/[0.05] transition">
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={handleToggleRecord} className={`p-1.5 rounded-md transition-colors ${isRecording ? 'text-red-500 bg-red-500/10 animate-pulse' : 'hover:text-white hover:bg-white/[0.05]'}`}>
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button type="submit" className="p-2 ml-0.5 bg-[#1a4a2f] hover:bg-emerald-700 text-white rounded-md transition flex-shrink-0 border border-emerald-800/50">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
              </div>
              )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Report Details + Quick Actions (Only shown if Report Conversation active) */}
        {activeReport ? (
          <div className={`${(mobileView === 'details' || showTabletDetails) ? 'flex' : 'hidden'} xl:flex absolute xl:static inset-y-0 right-0 z-40 xl:z-auto w-full xl:w-auto bg-[#020704]/95 xl:bg-transparent backdrop-blur-xl xl:backdrop-blur-none border-l xl:border-none border-white/[0.07] p-3 xl:p-0 flex-shrink-0 flex-col gap-1.5 overflow-hidden h-full shadow-2xl xl:shadow-none min-w-0 min-h-0`}>
            
            {/* Mobile/Tablet Close Button */}
            <div className="xl:hidden flex items-center justify-between flex-shrink-0 mb-0.5">
              <h3 className="text-[10.5px] font-bold text-white">Details & Actions</h3>
              <button onClick={() => { setShowTabletDetails(false); setMobileView('chat'); }} className="p-1 bg-white/[0.05] rounded-md text-gray-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Report Details Card */}
            <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-md flex flex-col flex-shrink-0">
              <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-1.5 flex-shrink-0">
                <h3 className="text-[11.5px] font-bold text-white flex-shrink-0">Report Details</h3>
                {/* Report Selector — switch between agent's reports */}
                {(() => {
                  const agentReports = allReports.filter(r => r.agentId === activeAgentId);
                  if (agentReports.length <= 1) {
                    // Only one report — just show urgency badge
                    return activeReport.urgency === 'High' ? (
                      <span className="text-[8px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-md flex-shrink-0">
                        High Priority
                      </span>
                    ) : null;
                  }
                  return (
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[8px] text-gray-500 flex-shrink-0">Viewing:</span>
                      <select
                        value={activeReport.id}
                        onChange={e => {
                          const chosen = allReports.find(r => r.id === e.target.value);
                          if (!chosen) return;
                          // Find or create conversation link for this report
                          const conv = conversations.find(c => c.reportId === chosen.id);
                          if (conv) setActiveConvId(conv.id);
                        }}
                        className="bg-[#0d1410] border border-white/[0.1] text-white text-[8px] rounded-md px-1.5 py-0.5 focus:outline-none focus:border-emerald-500/40 max-w-[79px] truncate cursor-pointer"
                        style={{ colorScheme: 'dark' }}
                      >
                        {agentReports.map(r => (
                          <option key={r.id} value={r.id} className="bg-[#0a0d0b] text-white">
                            {r.id} — {r.category} {r.urgency === 'High' ? '🔴' : r.urgency === 'Medium' ? '🟡' : '🟢'}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </div>

              <div className="px-3 py-2.5 text-[8.5px] flex-shrink-0 grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-y-1.5 sm:gap-y-1 items-start sm:items-center min-w-0 overflow-y-auto no-scrollbar max-h-[30vh] sm:max-h-none">
                <span className="text-gray-500">Report ID</span>
                <div className="flex items-center gap-0.5 justify-end">
                  <span className="text-white font-medium">{activeReport.id}</span>
                  <MoreHorizontal className="w-2.5 h-2.5 text-gray-600 cursor-pointer" />
                </div>
                
                <span className="text-gray-500">Category</span>
                <span className="text-white font-medium text-right">{activeReport.category}</span>
                
                <span className="text-gray-500">Location</span>
                <span className="text-white font-medium text-right truncate">{activeReport.location.village || activeReport.location.district}, {activeReport.location.state}</span>
                
                <span className="text-gray-500">Submitted On</span>
                <span className="text-white font-medium text-right">{new Date(activeReport.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                
                <span className="text-gray-500 self-start mt-0">Submitted By</span>
                <div className="flex items-center gap-1.5 justify-start sm:justify-end min-w-0">
                  <div className="text-left sm:text-right min-w-0">
                    <p className="text-white font-bold text-[8.5px] leading-none">{activeReport.agentName.split(' ')[0]}</p>
                    <p className="text-gray-500 text-[8px] mt-0">{activeReport.agentId}</p>
                  </div>
                  <img src={avatar(activeReport.agentName)} alt={activeReport.agentName}
                    className="w-5 h-5 rounded-full border border-white/10" />
                </div>
                
                <span className="text-gray-500 self-start mt-0">Assigned To</span>
                <div className="flex items-center gap-1.5 justify-start sm:justify-end min-w-0">
                  <div className="text-left sm:text-right min-w-0">
                    <p className="text-white font-bold text-[8.5px] leading-none">Ahmed Khan</p>
                    <p className="text-gray-500 text-[8px] mt-0">(You)</p>
                  </div>
                  <img src="https://ui-avatars.com/api/?name=Ahmed+Khan&background=111&color=fff&size=64" alt="Ahmed Khan"
                    className="w-5 h-5 rounded-full border border-white/10" />
                </div>
                
                <span className="text-gray-500">Urgency</span>
                <span className={`font-bold flex items-center gap-1 justify-start sm:justify-end ${activeReport.urgency==='High' ? 'text-red-400' : activeReport.urgency==='Medium' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  <span className={`w-1 h-1 rounded-full flex-shrink-0 ${activeReport.urgency==='High' ? 'bg-red-500' : activeReport.urgency==='Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {activeReport.urgency}
                </span>
                
                <span className="text-gray-500">Budget</span>
                <span className="text-white font-bold text-[9px] text-right">{activeReport.estimatedBudget}</span>
                
                <span className="text-gray-500">Beneficiaries</span>
                <span className="text-white font-medium text-right">{activeReport.beneficiaries?.families || 0} Families</span>
                
                <span className="text-gray-500">Status</span>
                <span className={`font-bold text-right ${activeReport.status==='Approved' ? 'text-emerald-400' : activeReport.status==='Converted' ? 'text-purple-400' : 'text-[#b8860b]'}`}>
                  {activeReport.status}
                </span>
              </div>
              
              <div className="px-3 py-1.5 border-t border-white/[0.06] bg-[#0a0d0b] shrink-0 z-10">
                <button className="w-full py-1.5 rounded-md bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/30 text-emerald-100 text-[8.5px] font-bold transition flex items-center justify-between px-3">
                  Take Action
                  <ChevronDown className="w-2.5 h-2.5 text-emerald-400" />
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex-shrink-0 min-w-0">
              <p className="text-[8.5px] font-bold text-white mb-1 ml-0.5">Quick Actions</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-1.5 min-w-0">
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
                    className={`flex flex-col items-center justify-center gap-1 group p-1.5 rounded-md border border-white/[0.08] bg-[#0a0d0b] transition-all ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-white/[0.02]'}`}>
                    <div className={`text-gray-400 transition
                      ${!disabled ? `group-hover:text-${hc}-400` : ''}`}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <span className="text-[8px] text-gray-500 group-hover:text-gray-300 text-center leading-[1.1] mt-0">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Report Timeline */}
            <div className="flex flex-col flex-1 min-h-0">
              <p className="text-[8.5px] font-bold text-white mb-1.5 ml-0.5 flex-shrink-0">Report Timeline</p>
              <div className="flex-1 overflow-y-auto no-scrollbar relative pl-2.5">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-white/[0.08]" />
                <div className="space-y-3 pb-1.5">
                  <div className="relative flex gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1 relative z-10 ring-4 ring-[#020704] ${activeReport.status === 'Approved' ? 'bg-emerald-500' : activeReport.status === 'Rejected' ? 'bg-red-500' : activeReport.status === 'Converted' ? 'bg-purple-500' : 'bg-[#b8860b]'}`} />
                    <div>
                      <p className="text-[8.5px] text-white font-bold">{activeReport.status}</p>
                      <p className="text-[8px] text-gray-500 mt-0">Current Status</p>
                    </div>
                  </div>
                  {activeReport.assignedAdminId && (
                    <div className="relative flex gap-2.5 opacity-60">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 relative z-10 ring-4 ring-[#020704]" />
                      <div>
                        <p className="text-[8.5px] text-white font-bold">Assigned for Review</p>
                        <p className="text-[8px] text-gray-500 mt-0">System auto-assigned to you</p>
                      </div>
                    </div>
                  )}
                  <div className="relative flex gap-2.5 opacity-60">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1 relative z-10 ring-4 ring-[#020704]" />
                    <div>
                      <p className="text-[8.5px] text-white font-bold">Report Submitted</p>
                      <p className="text-[8px] text-gray-500 mt-0">{new Date(activeReport.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} • By {activeReport.agentName.split(' ')[0]}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeAgent ? (
          /* Agent profile when no report or Operational Conversation selected */
          <div className={`${(mobileView === 'details' || showTabletDetails) ? 'flex' : 'hidden'} xl:flex absolute xl:static inset-y-0 right-0 z-40 xl:z-auto w-full xl:w-auto bg-[#020704]/95 xl:bg-transparent backdrop-blur-xl xl:backdrop-blur-none border-l xl:border-none border-white/[0.07] p-3 xl:p-0 flex-shrink-0 flex-col gap-3 h-full shadow-2xl xl:shadow-none min-w-0 min-h-0`}>
            
            {/* Mobile/Tablet Close Button */}
            <div className="xl:hidden flex items-center justify-between flex-shrink-0">
              <h3 className="text-[10.5px] font-bold text-white">Agent Info</h3>
              <button onClick={() => { setShowTabletDetails(false); setMobileView('chat'); }} className="p-1 bg-white/[0.05] rounded-md text-gray-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-md p-3 flex flex-col gap-2.5 flex-1">
              <h3 className="text-[10px] font-bold text-white hidden xl:block">Agent Profile</h3>
            <div className="flex flex-col items-center text-center py-2.5">
              <img src={avatar(activeAgent.name, activeAgent.avatarUrl)} alt={activeAgent.name}
                className="w-11 h-11 rounded-full border-2 border-emerald-500/30 mb-1.5" />
              <h4 className="text-[11.5px] font-bold text-white">{activeAgent.name}</h4>
              <p className="text-[8.5px] text-gray-400 mt-0.5">{activeAgent.role} · {activeAgent.region}</p>
              <span className="mt-1.5 px-2 py-0 rounded-full text-[8px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{activeAgent.status}</span>
            </div>
            <div className="space-y-2 text-[8.5px]">
              {([['Email', activeAgent.email], ['Phone', activeAgent.phone], ['District', activeAgent.district], ['Joined', activeAgent.joinDate ? new Date(activeAgent.joinDate).toLocaleDateString() : '—']] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-1.5">
                  <span className="text-gray-500 flex-shrink-0">{k}</span>
                  <span className="text-white font-medium text-right truncate max-w-[90px]">{v}</span>
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
        <div className="bg-[#0a0f0c] border border-emerald-500/20 rounded-md w-full max-w-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-emerald-900/20">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <div>
                <h3 className="text-[10.5px] font-bold text-white">AI Operational Insights</h3>
                <p className="text-[8px] text-gray-400 mt-0">Generated from live field operations data</p>
              </div>
            </div>
            <button onClick={() => setShowAIInsights(false)} className="p-1 text-gray-500 hover:text-white hover:bg-white/[0.05] rounded-md transition">
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2.5">
                <div className="w-6 h-6 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                <p className="text-[9px] text-gray-400">Analyzing operational data...</p>
              </div>
            ) : (
              aiInsights.split('\n\n').filter(Boolean).map((bullet, i) => {
                const boldMatch = bullet.match(/^\*\*(.+?)\*\*:?\s*([\s\S]*)$/);
                return (
                  <div key={i} className="flex gap-2.5 p-2.5 bg-white/[0.02] border border-white/[0.05] rounded-md">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0">
                      <span className="text-[8px] font-bold text-emerald-400">{i+1}</span>
                    </div>
                    <div className="flex-1">
                      {boldMatch ? (
                        <>
                          <p className="text-[9px] font-bold text-white mb-0">{boldMatch[1]}</p>
                          <p className="text-[8.5px] text-gray-300 leading-relaxed">{boldMatch[2]}</p>
                        </>
                      ) : (
                        <p className="text-[9px] text-gray-300 leading-relaxed">{bullet}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-[8px] text-gray-500">Based on {allReports.length} reports · {agents.length} agents · {conversations.length} conversations</p>
            <button onClick={handleAIInsights} disabled={aiLoading} className="text-[8.5px] font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-40 flex items-center gap-1 transition">
              <Sparkles className="w-2.5 h-2.5" /> Regenerate
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
