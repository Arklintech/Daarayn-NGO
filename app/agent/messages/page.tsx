'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, setDoc } from "firebase/firestore";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";
import { FieldConversation, FieldMessage } from "@/lib/db-field-ops";
import { notifyConversation } from "@/lib/notifications";
import { Search, Send, FileText, Settings, Paperclip, MessageSquare, ArrowLeft } from "lucide-react";

export default function AgentMessagesPage() {
  const { agentData, loading } = useFieldAgentAuth();
  
  const [conversations, setConversations] = useState<FieldConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FieldMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isMobileListVisible, setIsMobileListVisible] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!agentData?.id) return;
    
    const q = query(
      collection(db, "field_conversations"), 
      where("agentId", "==", agentData.id)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const list: FieldConversation[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as FieldConversation));
      list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      setConversations(list);
    });
    
    return () => unsub();
  }, [agentData?.id]);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    
    const q = query(
      collection(db, "field_messages"),
      where("conversationId", "==", activeConvId)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const list: FieldMessage[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as FieldMessage));
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(list);
      
      if (agentData?.id) {
        updateDoc(doc(db, "field_conversations", activeConvId), { unreadCountAgent: 0 }).catch(console.error);
      }
    });
    
    return () => unsub();
  }, [activeConvId, agentData?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConvId || !agentData) return;
    
    try {
      const msg: Omit<FieldMessage, "id"> = {
        conversationId: activeConvId,
        senderId: agentData.id,
        senderRole: "Agent",
        senderName: agentData.name,
        text: newMessage,
        timestamp: new Date().toISOString()
      };
      
      await addDoc(collection(db, "field_messages"), msg);
      
      await updateDoc(doc(db, "field_conversations", activeConvId), {
        lastMessage: {
          text: newMessage,
          timestamp: new Date().toISOString(),
          senderRole: "Agent"
        },
        unreadCountAdmin: 1, 
        updatedAt: new Date().toISOString(),
        status: "Waiting For Admin"
      });

      await notifyConversation.newMessage(activeConvId, agentData.name, newMessage);

      
      setNewMessage("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !activeConvId || !agentData) return;
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
      // Convert file to base64 so it can be stored directly in Firestore
      // (avoids Firebase Storage authentication/rules issues)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string); // data:image/png;base64,...
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const isImage = file.type.startsWith("image/");

      const msg: any = {
        conversationId: activeConvId,
        senderId: agentData.id,
        senderRole: "Agent",
        senderName: agentData.name,
        text: `📎 ${file.name}`,
        isMedia: true,
        mediaBase64: base64,
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
          senderRole: "Agent"
        },
        unreadCountAdmin: 1,
        updatedAt: new Date().toISOString(),
        status: "Waiting For Admin"
      });

      await notifyConversation.newMessage(activeConvId, agentData.name, `📎 ${file.name}`);


    } catch (err) {
      console.error("File upload failed", err);
      alert("Failed to send file. Please try again.");
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleStartOperationsConv = async () => {
    if (!agentData) return;
    const convId = `CONV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random()*900000)}`;
    const newConv: FieldConversation = {
      id: convId,
      type: "Operations",
      agentId: agentData.id,
      unreadCountAdmin: 0,
      unreadCountAgent: 0,
      status: "Resolved",
      isUrgent: false,
      lastMessage: { text: "Conversation Started", timestamp: new Date().toISOString(), senderRole: "System" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "field_conversations", convId), newConv);
    setActiveConvId(convId);
    setIsMobileListVisible(false);
  };

  const activeConv = conversations.find(c => c.id === activeConvId);

  if (loading) return <div className="p-10 text-center text-gray-500">Loading messages...</div>;

  return (
    <div className="flex rounded-2xl overflow-hidden admin-glass border border-luxury-border shadow-2xl relative z-10"
      style={{ height: "calc(100dvh - 140px)" }}>
      
      {/* Sidebar - Conversation List */}
      <div className={`w-full sm:w-[280px] bg-black/60 border-r border-luxury-border flex flex-col ${!isMobileListVisible ? 'hidden sm:flex' : 'flex'}`}>
        <div className="p-4 border-b border-luxury-border flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-white tracking-wide">Messages</h2>
          <button onClick={handleStartOperationsConv} className="p-1.5 bg-luxury-ivory/10 text-luxury-ivory rounded-lg hover:bg-luxury-ivory/20 border border-luxury-border transition" title="Start Operations Chat">
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-[12px]">No conversations yet.</div>
          ) : (
            conversations.map(conv => (
              <div 
                key={conv.id} 
                onClick={() => { setActiveConvId(conv.id); setIsMobileListVisible(false); }}
                className={`p-4 border-b border-white/[0.04] cursor-pointer transition ${activeConvId === conv.id ? 'bg-emerald-950/40 border-l-2 border-l-emerald-500' : 'hover:bg-white/[0.02]'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    {conv.type === 'Report' ? <FileText className="w-3.5 h-3.5 text-blue-400" /> : <Settings className="w-3.5 h-3.5 text-purple-400" />}
                    <span className="text-[12px] font-bold text-gray-200">{conv.type === 'Report' ? 'Report Discussion' : 'Operations'}</span>
                  </div>
                  <span className="text-[9px] text-gray-500">{new Date(conv.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p className="text-[11px] text-gray-400 truncate">{conv.lastMessage?.text || "No messages yet"}</p>
                {conv.unreadCountAgent > 0 && (
                  <span className="inline-block mt-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{conv.unreadCountAgent} New</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col bg-[#050b08] ${isMobileListVisible ? 'hidden sm:flex' : 'flex'}`}>
        {!activeConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
            <MessageSquare className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-[13px] text-gray-400">Select a conversation to start messaging</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-luxury-border bg-black/40 flex items-center gap-3">
              <button onClick={() => setIsMobileListVisible(true)} className="sm:hidden p-1.5 text-gray-400 hover:text-white bg-white/[0.05] border border-white/[0.05] rounded-lg">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-[14px] font-bold text-white">{activeConv?.type === 'Report' ? `Report: ${activeConv.reportId}` : 'Operations Support'}</h3>
                <p className="text-[10px] text-luxury-ivory font-medium">{activeConv?.status}</p>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-transparent">
              {messages.length === 0 && <p className="text-center text-gray-500 text-[11px] py-10">Start the conversation</p>}
              {messages.map(msg => {
                const isMe = msg.senderId === agentData?.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium text-gray-400">{isMe ? 'You' : msg.senderName}</span>
                      <span className="text-[8px] text-gray-600">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className={`px-4 py-2.5 max-w-[85%] text-[12px] leading-relaxed shadow-sm ${
                      isMe 
                        ? 'bg-gradient-to-r from-luxury-ivory to-[#b8860b] text-black rounded-2xl rounded-tr-sm font-medium' 
                        : 'bg-white/[0.05] text-gray-200 rounded-2xl rounded-tl-sm border border-luxury-border'
                    }`}>
                      {msg.isMedia ? (
                        <div className="flex flex-col gap-2">
                          {msg.isImage && msg.mediaBase64 ? (
                            <img src={msg.mediaBase64} alt={msg.mediaName || "Attachment"} className="max-w-full rounded-lg max-h-48 object-cover border border-black/10" />
                          ) : msg.mediaBase64 ? (
                            <a
                              href={msg.mediaBase64}
                              download={msg.mediaName || "attachment"}
                              className="flex items-center gap-2 underline underline-offset-2"
                            >
                              <FileText className="w-4 h-4" /> {msg.mediaName || "Download File"}
                            </a>
                          ) : msg.mediaUrls && msg.mediaUrls.length > 0 ? (
                            // Legacy messages that used Firebase Storage URLs
                            msg.mediaUrls.map((url: string, i: number) => (
                              url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? (
                                <img key={i} src={url} alt="Attachment" className="max-w-full rounded-lg max-h-48 object-cover border border-black/10" />
                              ) : (
                                <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline underline-offset-2">
                                  <FileText className="w-4 h-4" /> View Attachment
                                </a>
                              )
                            ))
                          ) : null}
                          <span className={isMe ? 'text-black/70 text-[10px]' : 'text-gray-400 text-[10px]'}>{msg.text}</span>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <div className="p-3 border-t border-luxury-border bg-black/40">
              <form onSubmit={handleSendMessage} className="flex gap-2 bg-black/60 border border-luxury-border rounded-xl p-1.5 focus-within:border-luxury-ivory transition-all relative">
                <label className={`p-2 text-gray-400 hover:text-white transition cursor-pointer flex items-center justify-center ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {isUploading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-500 border-t-white animate-spin" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                  <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx" disabled={isUploading} />
                </label>
                <input 
                  type="text" 
                  value={newMessage} 
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent text-[13px] text-white focus:outline-none placeholder:text-gray-600"
                />
                <button type="submit" className="p-2 bg-luxury-ivory hover:bg-[#b8860b] text-black rounded-lg transition">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
