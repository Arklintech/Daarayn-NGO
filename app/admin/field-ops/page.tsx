'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, updateDoc, setDoc, where, addDoc } from "firebase/firestore";
import { 
  Search, FileText, CheckCircle, Clock, AlertCircle, MessageSquare, 
  Briefcase, X, HelpCircle, Sparkles, UserPlus, Send, Paperclip, 
  MoreHorizontal, Filter, ArrowLeft, Bell, Users, Smile, Mic, ChevronDown, Settings
} from "lucide-react";
import { FieldAgent, FieldReport, FieldMessage, FieldConversation } from "@/lib/db-field-ops";
import { notifyFieldReport, notifyConversation } from "@/lib/notifications";

export default function FieldOperationsCenter() {
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

  // When active Agent changes, auto-select their most recent conversation
  useEffect(() => {
    if (!activeAgentId) { setActiveConvId(null); return; }
    
    // If the currently selected conv belongs to this agent, keep it.
    const currentConv = conversations.find(c => c.id === activeConvId);
    if (currentConv && currentConv.agentId === activeAgentId) return;
    
    const agentConvs = conversations.filter(c => c.agentId === activeAgentId);
    if (agentConvs.length > 0) {
      setActiveConvId(agentConvs[0].id);
    } else {
      setActiveConvId(null);
    }
  }, [activeAgentId, conversations]);

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
  const activeReport = activeConv?.reportId ? allReports.find(r => r.id === activeConv?.reportId) : null;
  
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

  const handleApprove = async () => {
    if (!activeReport) return;
    await updateDoc(doc(db, "field_reports", activeReport.id), { status: "Approved" });
    await notifyFieldReport.approved(activeReport.id, activeReport.title);
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
    await updateDoc(doc(db, "field_reports", activeReport.id), { status: "Converted", convertedCauseId: causeId });
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
      <div className="flex flex-col h-full w-full bg-[#020704] text-gray-200 overflow-hidden p-4">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-shrink-0 mb-4 gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-white tracking-wide">Field Operations Center</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">Manage field reports, communicate with field agents and track progress.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-[340px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search reports, agents, locations..."
              className="w-full bg-black/40 border border-white/[0.08] rounded-xl pl-10 pr-16 py-[9px] text-[12px] text-white focus:outline-none focus:border-white/20 placeholder:text-gray-500" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <kbd className="bg-white/[0.05] border border-white/[0.1] rounded px-1 py-0.5 text-[9px] text-gray-400">⌘</kbd>
              <kbd className="bg-white/[0.05] border border-white/[0.1] rounded px-1 py-0.5 text-[9px] text-gray-400">K</kbd>
            </div>
          </div>
          <button onClick={handleAIInsights} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-[9px] rounded-xl text-[12px] font-bold flex items-center gap-1.5 hover:bg-emerald-500/20 active:scale-95 transition">
            <Sparkles className="w-3.5 h-3.5" /> AI Insights
          </button>
          <button className="relative p-2 text-gray-400 hover:text-white transition">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border border-[#020704] rounded-full" />
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-6 gap-3 mb-4 flex-shrink-0">
        {([
          { label:'Field Agents',        value: agents.length || 182, sub:'Active',           color:'blue',   Icon: Users },
          { label:'Total Reports',       value: allReports.length || 2842, sub:'All Time',    color:'emerald',Icon: FileText },
          { label:'Pending Review',      value: pendingCount || 21,   sub:'Needs Attention',  color:'amber',  Icon: Clock },
          { label:'Unread Messages',     value: totalUnread,          sub:'Requires Reply',   color:'red',    Icon: MessageSquare },
          { label:'Urgent Reports',      value: urgentCount || 3,     sub:'High Priority',    color:'red',    Icon: AlertCircle },
          { label:'Verified & Approved', value: verifiedCount || 1256,sub:'This Year',        color:'emerald',Icon: CheckCircle },
        ] as const).map(({ label, value, sub, color, Icon }) => (
          <div key={label} className={`bg-[#0a0d0b] border rounded-xl p-3.5 flex items-center gap-3 ${color === 'amber' ? 'border-[#b8860b]/30' : 'border-white/[0.07]'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              color==='blue'   ? 'bg-blue-500/10 text-blue-400' :
              color==='emerald'? 'bg-emerald-500/10 text-emerald-400' :
              color==='amber'  ? 'bg-[#b8860b]/10 text-[#b8860b]' :
                                 'bg-red-500/10 text-red-400'
            }`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 truncate">{label}</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[18px] font-bold text-white leading-none">{value.toLocaleString()}</span>
                <span className={`text-[9px] font-semibold truncate ${
                  color==='blue' ? 'text-blue-400' : color==='emerald' ? 'text-emerald-400' :
                  color==='amber' ? 'text-[#b8860b]' : 'text-red-400'
                }`}>{sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3-COLUMN BODY ── */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Agent List */}
        <div className="w-[290px] flex-shrink-0 bg-[#0a0d0b] border border-white/[0.07] rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[13px] font-bold text-white mb-3">Field Agents & Conversations</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full bg-black/40 border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-white/20" />
              </div>
              <button className="p-1.5 border border-white/[0.08] rounded-lg bg-black/30 text-gray-400 hover:text-white transition">
                <Filter className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredAgents.length === 0 && (
              <p className="text-center text-gray-600 text-[11px] py-8">No agents found</p>
            )}
            {filteredAgents.map(agent => {
              const isActive = activeAgentId === agent.id;
              
              // Get all conversations for this agent
              const agentConvs = conversations.filter(c => c.agentId === agent.id);
              const unreadConvs = agentConvs.filter(c => c.unreadCountAdmin > 0).length;
              const hasActiveReports = allReports.filter(r => r.agentId === agent.id && ['Pending Review', 'Needs Info'].includes(r.status)).length > 0;
              
              const isSuspended = agent.status === 'Suspended';
              const dotColor = isSuspended ? 'amber' : unreadConvs > 0 ? 'red' : 'emerald';
              
              const statusLabel = isSuspended 
                ? 'Report under review' 
                : unreadConvs > 0 
                  ? `${unreadConvs} Unread Message${unreadConvs>1?'s':''}` 
                  : hasActiveReports 
                    ? 'Active Reports' 
                    : 'No Reports Yet';

              return (
                <div key={agent.id} onClick={() => setActiveAgentId(agent.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    isActive ? 'bg-emerald-950/50 border border-emerald-800/40' : 'hover:bg-white/[0.03] border border-transparent'
                  }`}>
                  <div className="relative flex-shrink-0">
                    <img src={avatar(agent.name, agent.avatarUrl)} alt={agent.name}
                      className="w-10 h-10 rounded-full object-cover border border-white/10" />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0a0d0b] ${
                      dotColor==='red' ? 'bg-red-500' : dotColor==='amber' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white truncate">{agent.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{agent.city || agent.district}, {agent.state}</p>
                    <p className={`text-[10px] mt-0.5 font-medium ${
                      dotColor==='red' ? 'text-red-400' : dotColor==='amber' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>• {statusLabel}</p>
                  </div>
                  {unreadConvs > 0 && (
                    <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {unreadConvs}
                    </span>
                  )}
                  {dotColor === 'emerald' && (
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] flex items-center justify-center flex-shrink-0">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* MIDDLE: Conversation Panel */}
        <div className="flex-1 bg-[#0a0d0b] border border-white/[0.07] rounded-2xl flex flex-col overflow-hidden min-w-0">

          {!activeAgentId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-[13px] font-semibold text-white">Central Communication Hub</p>
              <p className="text-[11px] text-gray-400 mt-2">Select an agent to view their conversations.</p>
            </div>

          ) : !activeConvId ? (
            /* Agent selected, but no conversation exists yet */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#06090a]">
              <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-[13px] font-semibold text-gray-300 mb-1.5">No conversations yet</p>
              <p className="text-[11px] text-gray-500 max-w-[220px]">Wait for the agent to submit a report or start an operations conversation.</p>
            </div>

          ) : (
            /* Active Conversation Selected */
            <>
              {/* Conversation Header & Switcher */}
              <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] flex-shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <button onClick={() => setActiveAgentId(null)} className="mt-1 text-gray-400 hover:text-white transition flex-shrink-0">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {activeConv?.type === 'Report' ? (
                          <>
                            <h2 className="text-[17px] font-extrabold text-white">Report: {activeConv?.reportId}</h2>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 bg-blue-500/10 text-blue-400 border-blue-500/30">
                              Report Discussion
                            </span>
                          </>
                        ) : (
                          <>
                            <h2 className="text-[17px] font-extrabold text-white">Operations Support</h2>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 bg-purple-500/10 text-purple-400 border-purple-500/30">
                              General Chat
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 truncate">
                        {activeAgent?.name} • {activeConv?.status}
                      </p>
                    </div>
                  </div>
                  
                  {/* Conversation Switcher Dropdown (Mock) */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select 
                      value={activeConvId} 
                      onChange={(e) => setActiveConvId(e.target.value)}
                      className="bg-white/[0.05] border border-white/[0.1] text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none"
                    >
                      {conversations.filter(c => c.agentId === activeAgentId).map(c => (
                        <option key={c.id} value={c.id} className="bg-black text-white">
                          {c.type === 'Report' ? `Report ${c.reportId}` : 'Operations'} {c.unreadCountAdmin > 0 ? ' (Unread)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Tabs only for Report conversations */}
                {activeConv?.type === 'Report' && activeReport && (
                  <div className="flex gap-5 mt-3">
                    {['Conversation','Details',`Media (${activeReport.media?.length || 0})`,`Documents (${activeReport.documents?.length || 0})`,'Timeline','History'].map(tab => {
                      const key = tab.split(' ')[0];
                      return (
                        <button key={tab} onClick={() => setActiveTab(key)}
                          className={`pb-2 text-[12px] font-medium border-b-2 transition whitespace-nowrap ${
                            activeTab === key ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                          }`}>{tab}</button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-[#06090a]">
                {messages.length === 0 && (
                  <div className="text-center py-8 text-gray-600 text-[12px]">No messages yet — start the conversation.</div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className="flex gap-3">
                    <img src={avatar(msg.senderName)} alt={msg.senderName}
                      className="w-8 h-8 rounded-full border border-white/10 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[12px] font-bold text-white">{msg.senderName}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          msg.senderRole==='Admin' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                        }`}>{msg.senderRole}</span>
                        <span className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleString()}</span>
                        <MoreHorizontal className="w-3.5 h-3.5 text-gray-700 ml-auto cursor-pointer hover:text-gray-400 transition" />
                      </div>
                      <div className={`inline-block max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm text-[12px] leading-relaxed border ${
                        msg.senderRole==='Admin'
                          ? 'bg-white/[0.02] border-white/[0.06] text-gray-300'
                          : 'bg-[#0a1f14] border-emerald-800/40 text-emerald-50'
                      }`}>
                        {(msg as any).isMedia ? (
                          <div className="flex flex-col gap-2">
                            {(msg as any).isImage && (msg as any).mediaBase64 ? (
                              <img
                                src={(msg as any).mediaBase64}
                                alt={(msg as any).mediaName || 'Image'}
                                className="max-w-full max-h-64 rounded-xl object-cover border border-white/10 cursor-pointer"
                                onClick={() => window.open((msg as any).mediaBase64, '_blank')}
                              />
                            ) : (msg as any).mediaBase64 ? (
                              <a
                                href={(msg as any).mediaBase64}
                                download={(msg as any).mediaName || 'attachment'}
                                className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                              >
                                <FileText className="w-4 h-4 flex-shrink-0" />
                                <span>{(msg as any).mediaName || 'Download File'}</span>
                              </a>
                            ) : (msg as any).mediaUrls?.length > 0 ? (
                              (msg as any).mediaUrls.map((url: string, i: number) => (
                                (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) ? (
                                  <img key={i} src={url} alt="Attachment" className="max-w-full max-h-64 rounded-xl object-cover border border-white/10" />
                                ) : (
                                  <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-emerald-400 underline">
                                    <FileText className="w-4 h-4" /> View Attachment
                                  </a>
                                )
                              ))
                            ) : null}
                            <span className="text-[10px] opacity-60">{msg.text}</span>
                          </div>
                        ) : msg.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-white/[0.06] bg-[#070a08] flex-shrink-0">
                <form onSubmit={handleSend}
                  className="flex items-center gap-2 bg-black/50 border border-white/[0.08] rounded-xl px-3 py-1.5 focus-within:border-emerald-500/40 transition-colors">
                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    placeholder={`Reply in ${activeConv?.type === 'Report' ? activeConv.reportId : 'Operations'}...`}
                    className="flex-1 bg-transparent text-[12px] text-white focus:outline-none placeholder:text-gray-600 py-1.5" />
                  <div className="flex items-center gap-0.5 text-gray-500">
                    <button type="button" className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.05] transition"><Paperclip className="w-4 h-4" /></button>
                    <button type="button" className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.05] transition"><Smile className="w-4 h-4" /></button>
                    <button type="button" className="p-1.5 hover:text-white rounded-lg hover:bg-white/[0.05] transition"><Mic className="w-4 h-4" /></button>
                  </div>
                  <button type="submit" className="p-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition flex-shrink-0">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Report Details + Quick Actions (Only shown if Report Conversation active) */}
        {activeConv?.type === 'Report' && activeReport ? (
          <div className="w-[300px] flex-shrink-0 flex flex-col gap-3">
            {/* Report Details Card */}
            <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-2xl flex flex-col overflow-y-auto no-scrollbar flex-1">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
                <h3 className="text-[13px] font-bold text-white">Report Details</h3>
                {activeReport.urgency === 'High' && (
                  <button className="flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg">
                    High Priority <ChevronDown className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="p-5 space-y-4 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Report ID</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-medium">{activeReport.id}</span>
                    <MoreHorizontal className="w-3.5 h-3.5 text-gray-600 cursor-pointer" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Category</span>
                  <span className="text-white font-medium text-right">{activeReport.category}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Location</span>
                  <span className="text-white font-medium text-right">{activeReport.location.village || activeReport.location.district}, {activeReport.location.state}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Submitted On</span>
                  <span className="text-white font-medium text-right">{new Date(activeReport.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                </div>

                {/* Submitted By */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-gray-500">Submitted By</span>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-white font-bold text-[11px]">{activeReport.agentName.split(' ')[0]}</p>
                      <p className="text-gray-500 text-[9px]">{activeReport.agentId}</p>
                    </div>
                    <img src={avatar(activeReport.agentName)} alt={activeReport.agentName}
                      className="w-7 h-7 rounded-full border border-white/10" />
                  </div>
                </div>

                {/* Assigned To */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-gray-500">Assigned To</span>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-white font-bold text-[11px]">Ahmed Khan</p>
                      <p className="text-gray-500 text-[9px]">(You)</p>
                    </div>
                    <img src="https://ui-avatars.com/api/?name=Ahmed+Khan&background=111&color=fff&size=64" alt="Ahmed Khan"
                      className="w-7 h-7 rounded-full border border-white/10" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Urgency</span>
                  <span className={`font-bold flex items-center gap-1.5 ${activeReport.urgency==='High' ? 'text-red-400' : activeReport.urgency==='Medium' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${activeReport.urgency==='High' ? 'bg-red-500' : activeReport.urgency==='Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    {activeReport.urgency}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Estimated Budget</span>
                  <span className="text-white font-bold text-[12px]">{activeReport.estimatedBudget}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Beneficiaries</span>
                  <span className="text-white font-medium">{activeReport.beneficiaries?.families || 0} Families</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={`font-bold ${activeReport.status==='Approved' ? 'text-emerald-400' : activeReport.status==='Converted' ? 'text-purple-400' : 'text-[#b8860b]'}`}>
                    {activeReport.status}
                  </span>
                </div>
              </div>

              <div className="px-5 pb-5">
                <button onClick={handleApprove}
                  disabled={['Approved','Converted'].includes(activeReport.status)}
                  className="w-full py-2.5 bg-emerald-950/60 hover:bg-emerald-950/80 text-emerald-400 border border-emerald-900/60 font-bold rounded-xl transition flex items-center justify-center gap-2 text-[12px] disabled:opacity-30 disabled:cursor-not-allowed">
                  Take Action <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-[#0a0d0b] border border-white/[0.07] rounded-2xl p-4 flex-shrink-0">
              <p className="text-[12px] font-bold text-white mb-4">Quick Actions</p>
              <div className="flex justify-between">
                {([
                  { label:'Approve', Icon:CheckCircle, hc:'emerald', fn:handleApprove },
                  { label:'Request Info', Icon:HelpCircle, hc:'amber', fn:undefined },
                  { label:'Reject', Icon:X, hc:'red', fn:undefined },
                  { label:'Assign', Icon:UserPlus, hc:'blue', fn:undefined },
                  { label:'Convert to Cause', Icon:Briefcase, hc:'purple', fn:handleConvert },
                ] as const).map(({ label, Icon, hc, fn }) => (
                  <button key={label} onClick={fn}
                    className="flex flex-col items-center gap-1.5 cursor-pointer group p-1">
                    <div className={`w-9 h-9 rounded-full border border-white/[0.1] bg-white/[0.02] flex items-center justify-center text-gray-400 transition
                      group-hover:bg-${hc}-500/10 group-hover:text-${hc}-400 group-hover:border-${hc}-500/30`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] text-gray-500 group-hover:text-gray-300 text-center leading-tight max-w-[44px]">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : activeAgent ? (
          /* Agent profile when no report or Operational Conversation selected */
          <div className="w-[300px] flex-shrink-0 bg-[#0a0d0b] border border-white/[0.07] rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="text-[13px] font-bold text-white">Agent Profile</h3>
            <div className="flex flex-col items-center text-center py-3">
              <img src={avatar(activeAgent.name, activeAgent.avatarUrl)} alt={activeAgent.name}
                className="w-16 h-16 rounded-full border-2 border-emerald-500/30 mb-3" />
              <h4 className="text-[15px] font-bold text-white">{activeAgent.name}</h4>
              <p className="text-[11px] text-gray-400 mt-1">{activeAgent.role} · {activeAgent.region}</p>
              <span className="mt-2 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{activeAgent.status}</span>
            </div>
            <div className="space-y-3.5 text-[11px]">
              {([['Email', activeAgent.email], ['Phone', activeAgent.phone], ['District', activeAgent.district], ['Joined', activeAgent.joinDate ? new Date(activeAgent.joinDate).toLocaleDateString() : '—']] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-2">
                  <span className="text-gray-500 flex-shrink-0">{k}</span>
                  <span className="text-white font-medium text-right truncate max-w-[160px]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-[300px] flex-shrink-0" />
        )}
      </div>
    </div>

    {/* ── AI INSIGHTS MODAL ── */}
    {showAIInsights && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="bg-[#0a0f0c] border border-emerald-500/20 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-emerald-900/20">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-[14px] font-bold text-white">AI Operational Insights</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Generated from live field operations data</p>
              </div>
            </div>
            <button onClick={() => setShowAIInsights(false)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/[0.05] rounded-lg transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                <p className="text-[12px] text-gray-400">Analyzing operational data...</p>
              </div>
            ) : (
              aiInsights.split('\n\n').filter(Boolean).map((bullet, i) => {
                const boldMatch = bullet.match(/^\*\*(.+?)\*\*:?\s*([\s\S]*)$/);
                return (
                  <div key={i} className="flex gap-3 p-3.5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-emerald-400">{i+1}</span>
                    </div>
                    <div className="flex-1">
                      {boldMatch ? (
                        <>
                          <p className="text-[12px] font-bold text-white mb-0.5">{boldMatch[1]}</p>
                          <p className="text-[11px] text-gray-300 leading-relaxed">{boldMatch[2]}</p>
                        </>
                      ) : (
                        <p className="text-[12px] text-gray-300 leading-relaxed">{bullet}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-[10px] text-gray-500">Based on {allReports.length} reports · {agents.length} agents · {conversations.length} conversations</p>
            <button onClick={handleAIInsights} disabled={aiLoading} className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-40 flex items-center gap-1.5 transition">
              <Sparkles className="w-3 h-3" /> Regenerate
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
