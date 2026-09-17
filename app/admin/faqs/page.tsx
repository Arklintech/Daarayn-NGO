'use client';

import React, { useState, useEffect } from "react";
import { 
  HelpCircle, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  X, 
  Sparkles, 
  BookOpen, 
  Save, 
  Layers
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  isActive: boolean;
}

const DEFAULT_FAQS: FAQItem[] = [
  {
    id: "faq_1",
    question: "How does the Daarayn Public Ledger ensure complete transparency?",
    answer: "Every single donation received is assigned a cryptographically unique Reference Code. The transaction amount, allocated cause, timestamp, and verification status are permanently indexed on our public ledger in real-time, allowing donors and auditors to verify transactions independently.",
    category: "Transparency",
    order: 1,
    isActive: true
  },
  {
    id: "faq_2",
    question: "What is Daarayn's administrative and operational fee policy?",
    answer: "We operate on a strict 100% donation deployment model for specified Zakat and relief funds. Dedicated logistics, audit verifications, and operational infrastructure costs are funded through designated administrative contributions.",
    category: "Donations",
    order: 2,
    isActive: true
  },
  {
    id: "faq_3",
    question: "How are field reports verified before funds are disbursed?",
    answer: "Field officers conduct on-ground assessments, capture geo-tagged media proof, and upload detailed need reports. Our central operations team and cognitive audit engine cross-verify beneficiaries, budget estimates, and urgency prior to final allocation approval.",
    category: "Field Operations",
    order: 3,
    isActive: true
  },
  {
    id: "faq_4",
    question: "Can I track the exact beneficiaries who received aid from my donation?",
    answer: "Yes. Once a project or relief distribution is marked completed by field agents, donors receive a Verified Completion Report containing photo proof, village/district location, and impact metrics directly in their donor portal.",
    category: "Public Ledger",
    order: 4,
    isActive: true
  },
  {
    id: "faq_5",
    question: "Is my donation eligible for Zakat compliance?",
    answer: "Yes. All Zakat-eligible campaigns are clearly designated and reviewed under strict Shariah compliance principles. Zakat funds are segregated in dedicated ledgers and delivered directly to eligible Asnaf beneficiaries.",
    category: "Zakat",
    order: 5,
    isActive: true
  }
];

const CATEGORIES = ["All", "Transparency", "Donations", "Field Operations", "Public Ledger", "Zakat", "General"];

export default function AdminFAQs() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>("faq_1");
  
  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [formData, setFormData] = useState({
    question: "",
    answer: "",
    category: "General",
    order: 1,
    isActive: true
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("daarayn_admin_faqs");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFaqs(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load FAQs from storage", e);
    }
    setFaqs(DEFAULT_FAQS);
  }, []);

  const persistFaqs = (updatedList: FAQItem[]) => {
    setFaqs(updatedList);
    try {
      localStorage.setItem("daarayn_admin_faqs", JSON.stringify(updatedList));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error("Failed to persist FAQs", e);
    }
  };

  const handleOpenAddModal = () => {
    setEditingFaq(null);
    setFormData({
      question: "",
      answer: "",
      category: selectedCategory !== "All" ? selectedCategory : "General",
      order: faqs.length + 1,
      isActive: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (faq: FAQItem) => {
    setEditingFaq(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category || "General",
      order: faq.order || 1,
      isActive: faq.isActive !== false
    });
    setIsModalOpen(true);
  };

  const handleSaveFaq = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question.trim() || !formData.answer.trim()) return;

    if (editingFaq) {
      const updated = faqs.map(item => 
        item.id === editingFaq.id ? { ...item, ...formData } : item
      );
      persistFaqs(updated);
    } else {
      const newItem: FAQItem = {
        id: `faq_${Date.now()}`,
        ...formData
      };
      persistFaqs([...faqs, newItem]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteFaq = (id: string) => {
    if (confirm("Are you sure you want to delete this FAQ item?")) {
      const updated = faqs.filter(f => f.id !== id);
      persistFaqs(updated);
    }
  };

  const handleToggleStatus = (id: string) => {
    const updated = faqs.map(f => f.id === id ? { ...f, isActive: !f.isActive } : f);
    persistFaqs(updated);
  };

  const filteredFaqs = faqs.filter(f => {
    const matchesCategory = selectedCategory === "All" || f.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  }).sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-luxury-gold/10 border border-luxury-gold/20">
              <HelpCircle className="w-4 h-4 text-luxury-gold" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">FAQ Management</h1>
          </div>
          <p className="text-gray-400 text-xs md:text-sm ml-10.5">
            Manage institutional and public questions, transparency disclosures, and donor guidelines.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <motion.span 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="text-xs font-semibold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl"
            >
              <Check className="w-3.5 h-3.5" /> Saved to Ledger
            </motion.span>
          )}

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-black transition shadow-lg active:scale-95"
            style={{ background: 'var(--color-luxury-gold, #d4af37)' }}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" /> Add New FAQ
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto no-scrollbar pb-1 md:pb-0">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/40 shadow-sm'
                  : 'bg-white/[0.03] text-gray-400 hover:text-white border border-white/[0.05]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-luxury-gold/60"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* FAQ Accordion List */}
      <div className="space-y-3">
        {filteredFaqs.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
            <HelpCircle className="w-10 h-10 mx-auto text-gray-600 mb-3" />
            <p className="text-sm font-semibold text-white">No FAQ items found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your category filter or search query.</p>
          </div>
        ) : (
          filteredFaqs.map((item, index) => {
            const isExpanded = expandedFaqId === item.id;
            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isExpanded 
                    ? 'border-luxury-gold/30 bg-[#0d1628]/60 shadow-lg' 
                    : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                {/* Header Row */}
                <div 
                  onClick={() => setExpandedFaqId(isExpanded ? null : item.id)}
                  className="p-4 md:p-5 flex items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-gray-400 flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm md:text-base font-semibold text-white truncate">
                        {item.question}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400">
                          {item.category}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                          item.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {item.isActive ? 'Active' : 'Draft'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Chevron */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(item.id)}
                      title={item.isActive ? "Set to Draft" : "Publish"}
                      className={`p-2 rounded-xl border text-xs transition ${
                        item.isActive ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-gray-700 text-gray-500 hover:bg-white/5'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(item)}
                      className="p-2 rounded-xl border border-white/10 hover:border-white/20 text-gray-300 hover:text-white hover:bg-white/5 transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFaq(item.id)}
                      className="p-2 rounded-xl border border-red-500/20 hover:border-red-500/40 text-red-400 hover:bg-red-500/10 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    <button
                      type="button"
                      onClick={() => setExpandedFaqId(isExpanded ? null : item.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-white transition"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Answer Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-white/[0.06] px-5 py-4 bg-black/20"
                    >
                      <p className="text-xs md:text-sm text-gray-300 leading-relaxed font-sans whitespace-pre-wrap">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setIsModalOpen(false)}>
          <div 
            className="w-full max-w-xl rounded-3xl p-6 md:p-8 space-y-6 border border-white/10 shadow-2xl"
            style={{ background: '#0a101d' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-luxury-gold/10 border border-luxury-gold/20 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-luxury-gold" />
                </div>
                <h2 className="text-base md:text-lg font-bold text-white">
                  {editingFaq ? "Edit FAQ Item" : "Create New FAQ"}
                </h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFaq} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1.5 uppercase tracking-wider">
                  Question
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., How can I verify my donation on the public ledger?"
                  value={formData.question}
                  onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-xs md:text-sm text-white focus:outline-none focus:border-luxury-gold/60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 font-semibold mb-1.5 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-3 rounded-xl bg-black/40 border border-white/10 text-xs md:text-sm text-white focus:outline-none focus:border-luxury-gold/60 cursor-pointer"
                  >
                    {CATEGORIES.filter(c => c !== "All").map(c => (
                      <option key={c} value={c} style={{ background: '#0a101d' }}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 font-semibold mb-1.5 uppercase tracking-wider">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.order}
                    onChange={(e) => setFormData(prev => ({ ...prev, order: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-xs md:text-sm text-white focus:outline-none focus:border-luxury-gold/60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1.5 uppercase tracking-wider">
                  Answer
                </label>
                <textarea
                  rows={5}
                  required
                  placeholder="Provide a clear, authoritative, and helpful answer..."
                  value={formData.answer}
                  onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-xs md:text-sm text-white focus:outline-none focus:border-luxury-gold/60 resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="faq_is_active"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border-white/20 bg-black/40 text-luxury-gold focus:ring-luxury-gold/40"
                />
                <label htmlFor="faq_is_active" className="text-xs text-gray-300 font-medium select-none cursor-pointer">
                  Published and visible on public portals
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-black transition shadow-lg"
                  style={{ background: 'var(--color-luxury-gold, #d4af37)' }}
                >
                  {editingFaq ? "Update FAQ" : "Save FAQ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
