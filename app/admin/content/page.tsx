'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { 
  FileText, 
  Save, 
  Plus, 
  Trash2, 
  MessageSquare,
  HelpCircle,
  TrendingUp,
  Layout
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminContent() {
  const [activeSubTab, setActiveSubTab] = useState<"homepage" | "testimonials" | "faqs">("homepage");
  const [loading, setLoading] = useState(false);

  // Homepage CMS state
  const [homepageState, setHomepageState] = useState({
    heroTitle: "Transparent and Impactful Giving",
    heroSubtitle: "Contribute with full accountability. Every rupee is recorded in our public ledger, verified, and mapped directly to beneficiaries.",
    mission: "Empowering rural and underprivileged communities through education, primary medical relief, and clean water infrastructure.",
    vision: "A transparent and accountable foundation where every donor can track their contributions in real-time.",
    statVolunteers: 25,
    statWaterWells: 9,
    statLedgerVerified: 12
  });

  // Testimonials state
  const [testimonials, setTestimonials] = useState<any[]>([
    { id: "test_1", author: "Farhan Siddiqui", content: "The level of transparency here is unmatched. I can see my donation with my reference code right in the ledger.", role: "Donor" },
    { id: "test_2", author: "Mariam Akhtar", content: "They helped Zainab Bi's family with direct cash transfer for her daughter's school fees. Fully documented.", role: "Local Inspector" }
  ]);

  // FAQs state
  const [faqs, setFaqs] = useState<any[]>([
    { id: "faq_1", question: "How does the public ledger work?", answer: "When you donate, your tracking ID is listed along with your name, cause, and amount. You can verify your transaction instantly." },
    { id: "faq_2", question: "What is the administrative fee?", answer: "We maintain a 90/10 split where 90% goes directly to the causes, and 10% is dedicated to verification audits and logistics." }
  ]);

  // Form states for new entry
  const [newTestimonial, setNewTestimonial] = useState({ author: "", content: "", role: "Donor" });
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });

  useEffect(() => {
    async function loadCMSContent() {
      try {
        const docRef = doc(db, "settings", "homepageCMS");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setHomepageState(docSnap.data() as any);
        }
      } catch (err) {
        console.warn("CMS config not found in settings collection, using defaults.");
      }
    }
    loadCMSContent();
  }, []);

  const handleSaveHomepage = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, "settings", "homepageCMS"), homepageState);
      alert("Homepage CMS parameters saved successfully!");
    } catch (err) {
      console.error("Save homepage settings error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTestimonial = () => {
    if (!newTestimonial.author || !newTestimonial.content) return;
    const newEntry = { id: `test_${Date.now()}`, ...newTestimonial };
    setTestimonials(prev => [...prev, newEntry]);
    setNewTestimonial({ author: "", content: "", role: "Donor" });
  };

  const handleAddFaq = () => {
    if (!newFaq.question || !newFaq.answer) return;
    const newEntry = { id: `faq_${Date.now()}`, ...newFaq };
    setFaqs(prev => [...prev, newEntry]);
    setNewFaq({ question: "", answer: "" });
  };

  return (
    <div className="space-y-6 text-xs">
      {/* Sub tabs */}
      <div className="flex gap-2 border-b border-white/[0.06] pb-3">
        {[
          { id: "homepage", label: "Homepage Hero & Stats", icon: Layout },
          { id: "testimonials", label: "Testimonials", icon: MessageSquare },
          { id: "faqs", label: "Frequently Asked Questions", icon: HelpCircle }
        ].map((subTab) => {
          const Icon = subTab.icon;
          return (
            <button
              key={subTab.id}
              onClick={() => setActiveSubTab(subTab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition ${
                activeSubTab === subTab.id 
                  ? "bg-white/[0.04] text-white border border-white/[0.08]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 text-luxury-ivory" />
              {subTab.label}
            </button>
          );
        })}
      </div>

      {activeSubTab === "homepage" && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl p-6 rounded-3xl admin-glass border border-white/[0.06]"
        >
          <form onSubmit={handleSaveHomepage} className="space-y-5">
            <div>
              <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Hero Section Header Title</label>
              <input 
                type="text"
                required
                value={homepageState.heroTitle}
                onChange={(e) => setHomepageState(prev => ({ ...prev, heroTitle: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
              />
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Hero Section Description Subtitle</label>
              <textarea 
                rows={3}
                required
                value={homepageState.heroSubtitle}
                onChange={(e) => setHomepageState(prev => ({ ...prev, heroSubtitle: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Mission Statement</label>
                <textarea 
                  rows={3}
                  value={homepageState.mission}
                  onChange={(e) => setHomepageState(prev => ({ ...prev, mission: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Vision Statement</label>
                <textarea 
                  rows={3}
                  value={homepageState.vision}
                  onChange={(e) => setHomepageState(prev => ({ ...prev, vision: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
              <h4 className="text-[10px] font-bold text-luxury-ivory uppercase tracking-wider mb-4">Homepage counters & indicators</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Active Volunteers</label>
                  <input 
                    type="number"
                    value={homepageState.statVolunteers}
                    onChange={(e) => setHomepageState(prev => ({ ...prev, statVolunteers: Number(e.target.value) }))}
                    className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Water Projects</label>
                  <input 
                    type="number"
                    value={homepageState.statWaterWells}
                    onChange={(e) => setHomepageState(prev => ({ ...prev, statWaterWells: Number(e.target.value) }))}
                    className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Verified Audits</label>
                  <input 
                    type="number"
                    value={homepageState.statLedgerVerified}
                    onChange={(e) => setHomepageState(prev => ({ ...prev, statLedgerVerified: Number(e.target.value) }))}
                    className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white font-semibold"
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold tracking-wide transition flex items-center gap-1.5 shadow-lg"
            >
              <Save className="w-4 h-4" /> 
              {loading ? "Saving config..." : "Save Homepage Content"}
            </button>
          </form>
        </motion.div>
      )}

      {activeSubTab === "testimonials" && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Creator form */}
          <div className="p-6 rounded-3xl admin-glass border border-white/[0.06] h-fit">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Add Testimonial</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Author Name</label>
                <input 
                  type="text"
                  value={newTestimonial.author}
                  onChange={(e) => setNewTestimonial(prev => ({ ...prev, author: e.target.value }))}
                  placeholder="e.g. Farhan Siddiqui"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Author Role</label>
                <input 
                  type="text"
                  value={newTestimonial.role}
                  onChange={(e) => setNewTestimonial(prev => ({ ...prev, role: e.target.value }))}
                  placeholder="e.g. Local Inspector"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Content Statement</label>
                <textarea 
                  rows={3}
                  value={newTestimonial.content}
                  onChange={(e) => setNewTestimonial(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Testimonial review text..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
                />
              </div>
              <button 
                onClick={handleAddTestimonial}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold tracking-wide transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Save Testimonial
              </button>
            </div>
          </div>

          {/* Testimonial list */}
          <div className="lg:col-span-2 space-y-4">
            {testimonials.map((item) => (
              <div 
                key={item.id}
                className="p-5 rounded-3xl admin-glass border border-white/[0.06] flex items-start justify-between gap-4"
              >
                <div>
                  <h4 className="font-bold text-white text-xs">{item.author} <span className="text-gray-500 font-semibold uppercase tracking-wider text-[9px] ml-1">({item.role})</span></h4>
                  <p className="text-gray-400 text-[11px] mt-1.5 italic leading-relaxed">"{item.content}"</p>
                </div>
                <button 
                  onClick={() => setTestimonials(prev => prev.filter(t => t.id !== item.id))}
                  className="p-2 rounded-xl bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {activeSubTab === "faqs" && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Creator form */}
          <div className="p-6 rounded-3xl admin-glass border border-white/[0.06] h-fit">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Add FAQ Item</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Question Query</label>
                <input 
                  type="text"
                  value={newFaq.question}
                  onChange={(e) => setNewFaq(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="e.g. Is my donation tax-exempt?"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Answer Detail</label>
                <textarea 
                  rows={3}
                  value={newFaq.answer}
                  onChange={(e) => setNewFaq(prev => ({ ...prev, answer: e.target.value }))}
                  placeholder="Resolution explanation text..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
                />
              </div>
              <button 
                onClick={handleAddFaq}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold tracking-wide transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Save FAQ
              </button>
            </div>
          </div>

          {/* FAQ list */}
          <div className="lg:col-span-2 space-y-4">
            {faqs.map((item) => (
              <div 
                key={item.id}
                className="p-5 rounded-3xl admin-glass border border-white/[0.06] flex items-start justify-between gap-4"
              >
                <div>
                  <h4 className="font-bold text-white text-xs">{item.question}</h4>
                  <p className="text-gray-400 text-[11px] mt-1.5 leading-relaxed">{item.answer}</p>
                </div>
                <button 
                  onClick={() => setFaqs(prev => prev.filter(f => f.id !== item.id))}
                  className="p-2 rounded-xl bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

    </div>
  );
}
