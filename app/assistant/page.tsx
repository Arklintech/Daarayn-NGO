'use client';

import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  HelpCircle, 
  ArrowRight,
  TrendingUp,
  FileText,
  BadgeAlert,
  ArrowLeft,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  references?: Array<{ source: string; content: string }>;
}

export default function PublicAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Assalamu Alaikum. I am the **Daarayn Foundation Assistant**, your helper for transparency, project updates, and public ledger audits. How can I assist you with your giving tracking today?"
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionId(`PUB-${Date.now()}`);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setLoading(true);

    try {
      const historyPayload = messages
        .filter(m => m.id !== "welcome")
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          sessionId
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}-assistant`,
          role: "assistant",
          content: data.reply,
          references: data.references || []
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}-assistant`,
          role: "assistant",
          content: "I apologize, I encountered a communication error with our ledger core. Please try again."
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: "Network issue. Please check your internet connection."
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(inputValue);
  };

  const suggestedPrompts = [
    "What is the Daarayn 90/10 Amanah policy?",
    "Show verified projects in Bihar",
    "How is the Quran memorization program funded?",
    "How can I track my donation reference code?"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06140D] via-[#020704] to-[#040D09] text-gray-200 flex flex-col font-sans relative overflow-hidden">
      {/* Background blurs */}
      <div className="absolute top-0 left-0 w-80 h-80 rounded-full bg-emerald-900/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-luxury-ivory/5 blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-black/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition">
            <img src="/brand logo1.png" alt="Daarayn Logo" className="w-8 h-8 object-contain" />
            <div>
              <h1 className="text-sm font-semibold tracking-[0.25em] font-playfair text-white">DAARAYN</h1>
              <span className="text-[8px] font-semibold text-luxury-ivory uppercase tracking-widest block -mt-0.5">Foundation Portal</span>
            </div>
          </Link>
          
          <Link 
            href="/"
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-white transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
        </div>
      </header>

      {/* Chat workspace */}
      <main className="flex-grow max-w-4xl w-full mx-auto px-6 py-8 flex flex-col gap-6 relative z-10">
        
        {/* Messages viewport */}
        <div className="flex-grow bg-white/[0.01] border border-white/[0.04] rounded-3xl p-6 overflow-y-auto max-h-[60vh] space-y-6 scrollbar-thin">
          <AnimatePresence>
            {messages.map((msg) => {
              const isAssistant = msg.role === "assistant";
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 ${isAssistant ? "justify-start" : "justify-end"}`}
                >
                  {isAssistant && (
                    <div className="w-8 h-8 rounded-xl bg-luxury-ivory/10 border border-luxury-ivory/20 flex items-center justify-center text-luxury-ivory font-bold text-xs shrink-0">
                      D
                    </div>
                  )}

                  <div className="space-y-2 max-w-[80%]">
                    <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
                      isAssistant 
                        ? "bg-white/[0.03] border border-white/[0.06] text-gray-300 rounded-tl-sm"
                        : "bg-gradient-to-r from-luxury-ivory to-white text-black font-semibold rounded-tr-sm"
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {/* RAG references tags */}
                    {isAssistant && msg.references && msg.references.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.references.map((ref, idx) => (
                          <div 
                            key={idx}
                            title={ref.content}
                            className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[8px] font-bold text-luxury-ivory uppercase tracking-wider cursor-help"
                          >
                            {ref.source}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {loading && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-xl bg-luxury-ivory/10 border border-luxury-ivory/20 flex items-center justify-center text-luxury-ivory font-bold text-xs shrink-0 animate-pulse">
                D
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-gray-500 text-xs rounded-tl-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce delay-100" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce delay-200" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested prompts list */}
        {messages.length === 1 && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Suggested Inquiries</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {suggestedPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="p-3 text-left bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] rounded-xl text-xs text-gray-300 hover:text-white transition flex items-center justify-between"
                >
                  {p}
                  <ArrowRight className="w-3.5 h-3.5 text-luxury-ivory" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input box */}
        <form onSubmit={handleFormSubmit} className="flex gap-3 bg-white/[0.02] border border-white/[0.06] p-2 rounded-2xl focus-within:border-luxury-ivory/50 transition">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Query public ledger, program objectives, transparency split rules..."
            className="flex-grow bg-transparent px-3 py-2 text-xs focus:outline-none text-white placeholder-gray-600"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || loading}
            className="px-4 py-2 bg-gradient-to-r from-luxury-ivory to-white text-black hover:opacity-90 disabled:opacity-30 rounded-xl transition text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </form>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-6 text-center text-[10px] text-gray-600 space-y-1 relative z-10 bg-black/20">
        <p>Daarayn AI Trust Operating System — Public Assistant Layer</p>
        <p>Grounded strictly in verified platform ledger updates • Transparency • Accountability • Amanah</p>
      </footer>
    </div>
  );
}
