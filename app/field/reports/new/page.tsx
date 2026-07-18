'use client';

import React, { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, ArrowRight, CheckCircle, MapPin, Users, FileText, Camera, Upload, ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { getNextFieldSerial, FieldReport } from "@/lib/db-field-ops";
import { notifyFieldReport } from "@/lib/notifications";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";

export default function NewReportWizard() {
  const router = useRouter();
  const { agentData, loading: authLoading } = useFieldAgentAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    category: "Masjid Repair",
    title: "",
    description: "",
    urgency: "Medium",
    estimatedBudget: "",
    country: "India",
    state: "Telangana",
    district: "",
    village: "",
    families: 0,
    children: 0,
    women: 0,
    elderly: 0,
    beneficiaryDesc: ""
  });

  const handleSubmit = async () => {
    if (!agentData) return;
    setLoading(true);
    try {
      const reportId = await getNextFieldSerial("field_reports", "FR");
      const agentId = agentData.id;
      const agentName = agentData.name;

      const report: FieldReport = {
        id: reportId,
        agentId,
        agentName,
        category: formData.category,
        title: formData.title,
        description: formData.description,
        urgency: formData.urgency as "Low" | "Medium" | "High",
        estimatedBudget: formData.estimatedBudget,
        location: {
          country: formData.country,
          state: formData.state,
          district: formData.district,
          village: formData.village
        },
        beneficiaries: {
          families: Number(formData.families),
          children: Number(formData.children),
          women: Number(formData.women),
          elderly: Number(formData.elderly),
          description: formData.beneficiaryDesc
        },
        media: [
          "https://images.unsplash.com/photo-1548048026-5a1a941d93d3?q=80&w=400"
        ], // Mocked image for v1
        documents: [],
        status: "Pending Review",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "field_reports", reportId), report);

      // Create a corresponding conversation for this report so the admin can discuss it with the agent
      const convId = `CONV-REPORT-${reportId}`;
      const reportConv: any = {
        id: convId,
        type: "Report",
        reportId: reportId,
        agentId: agentId,
        unreadCountAdmin: 1,
        unreadCountAgent: 0,
        status: "Waiting For Admin",
        isUrgent: formData.urgency === "High",
        lastMessage: {
          text: `🚨 Submitted Report: ${formData.title}`,
          timestamp: new Date().toISOString(),
          senderRole: "Agent"
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, "field_conversations", convId), reportConv);

      // Create an initial message in field_messages to start the discussion thread
      const initialMessage = {
        conversationId: convId,
        senderId: agentId,
        senderRole: "Agent",
        senderName: agentName,
        text: `Assalamu Alaikum. I have submitted the report: "${formData.title}". Please review it.\n\nDescription: ${formData.description}\n\nUrgency: ${formData.urgency}\nEstimated Budget: ${formData.estimatedBudget}`,
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(db, "field_messages"), initialMessage);

      // Log activity
      const actId = `ACT-${Date.now()}`;
      await setDoc(doc(db, "field_activities", actId), {
        id: actId,
        reportId: reportId,
        agentId: agentId,
        action: "Report Submitted",
        performedBy: agentName,
        timestamp: new Date().toISOString()
      });

      // Notify admin
      await notifyFieldReport.newSubmission(reportId, agentId, formData.title, agentName, formData.urgency);

      setStep(6); // Success screen
    } catch (err) {
      console.error(err);
      alert("Failed to submit report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => setStep(prev => Math.min(prev + 1, 5));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  if (authLoading || !agentData) return null;

  return (
    <div className="space-y-6 pb-6">
      
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/field/dashboard" className="p-2 admin-glass border border-white/[0.08] rounded-xl hover:bg-white/[0.04]">
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </Link>
        <h2 className="text-lg font-bold text-luxury-gold font-playfair uppercase">New Assessment</h2>
      </div>

      {/* Progress Bar */}
      {step < 6 && (
        <div className="flex items-center gap-1.5 mb-8">
          {[1,2,3,4,5].map(i => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-luxury-gold' : 'bg-white/[0.08]'}`}></div>
          ))}
        </div>
      )}

      {/* Step 1: Basic Information */}
      {step === 1 && (
        <div className="space-y-5 animate-in slide-in-from-right-4">
          <div className="flex items-center gap-3 text-luxury-gold mb-2">
            <FileText className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Basic Info</h3>
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Need Category</label>
            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50">
              <option>Masjid Repair</option>
              <option>Medical Emergency</option>
              <option>Water Well</option>
              <option>Orphan Support</option>
              <option>Education</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Descriptive Title</label>
            <input placeholder="e.g. Roof Collapse at Al-Huda Masjid" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Estimated Budget Needed</label>
            <input placeholder="e.g. ₹50,000" value={formData.estimatedBudget} onChange={e => setFormData({...formData, estimatedBudget: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Urgency</label>
            <div className="grid grid-cols-3 gap-2">
              {['Low', 'Medium', 'High'].map(u => (
                <button key={u} onClick={() => setFormData({...formData, urgency: u})} className={`py-2.5 rounded-xl text-xs font-bold transition ${formData.urgency === u ? 'bg-luxury-gold text-black shadow-[0_0_10px_rgba(212,175,55,0.3)]' : 'bg-black/40 border border-white/[0.08] text-gray-400 hover:text-white'}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Location */}
      {step === 2 && (
        <div className="space-y-5 animate-in slide-in-from-right-4">
          <div className="flex items-center gap-3 text-luxury-gold mb-2">
            <MapPin className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Location Details</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">State</label>
              <input value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">District</label>
              <input placeholder="District Name" value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Village / Town / Area</label>
            <input placeholder="Local village name" value={formData.village} onChange={e => setFormData({...formData, village: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
          </div>
          
          <button className="w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-sm flex items-center justify-center gap-2 mt-4">
            <MapPin className="w-4 h-4" /> Auto-detect Current GPS
          </button>
        </div>
      )}

      {/* Step 3: Beneficiaries */}
      {step === 3 && (
        <div className="space-y-5 animate-in slide-in-from-right-4">
          <div className="flex items-center gap-3 text-luxury-gold mb-2">
            <Users className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Beneficiaries</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Families</label>
              <input type="number" value={formData.families} onChange={e => setFormData({...formData, families: Number(e.target.value)})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Children</label>
              <input type="number" value={formData.children} onChange={e => setFormData({...formData, children: Number(e.target.value)})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Women</label>
              <input type="number" value={formData.women} onChange={e => setFormData({...formData, women: Number(e.target.value)})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Elderly</label>
              <input type="number" value={formData.elderly} onChange={e => setFormData({...formData, elderly: Number(e.target.value)})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50" />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Detailed Description</label>
            <textarea rows={4} placeholder="Describe the situation in detail..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-luxury-gold/50 resize-none"></textarea>
          </div>
        </div>
      )}

      {/* Step 4: Evidence */}
      {step === 4 && (
        <div className="space-y-5 animate-in slide-in-from-right-4">
          <div className="flex items-center gap-3 text-luxury-gold mb-2">
            <Camera className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Evidence & Media</h3>
          </div>

          <div className="admin-glass border border-dashed border-white/[0.2] rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.05] flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-luxury-gold" />
            </div>
            <h4 className="text-white font-bold mb-1">Upload Photos & Videos</h4>
            <p className="text-xs text-gray-400 mb-6 max-w-[200px]">Take photos of the site, damage, or required proof directly from your camera.</p>
            <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition">
              Open Camera
            </button>
          </div>

          <div className="admin-glass border border-dashed border-white/[0.2] rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <h4 className="text-white font-bold mb-1 text-sm">Attach Documents</h4>
            <p className="text-xs text-gray-400 mb-4">Estimates, medical bills, requests.</p>
            <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl text-xs font-medium transition">
              Select Files
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="space-y-5 animate-in slide-in-from-right-4">
          <div className="flex items-center gap-3 text-luxury-gold mb-2">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Review & Submit</h3>
          </div>

          <div className="admin-glass border border-white/[0.08] rounded-2xl p-5 space-y-4">
            <div className="flex justify-between border-b border-white/[0.06] pb-3">
              <span className="text-gray-400 text-xs">Title</span>
              <span className="text-white text-xs font-medium text-right max-w-[150px] truncate">{formData.title || "Untitled"}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.06] pb-3">
              <span className="text-gray-400 text-xs">Location</span>
              <span className="text-white text-xs font-medium text-right">{formData.village}, {formData.district}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.06] pb-3">
              <span className="text-gray-400 text-xs">Budget</span>
              <span className="text-luxury-gold text-xs font-bold text-right">{formData.estimatedBudget || "TBD"}</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-gray-400 text-xs">Evidence</span>
              <span className="text-emerald-400 text-xs font-medium text-right">1 Image Attached</span>
            </div>
          </div>
          
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <p className="text-xs text-amber-400 leading-relaxed text-center font-medium">By submitting this report, you confirm that all information and evidence provided is truthful and verified by you personally.</p>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      {step < 6 && (
        <div className="flex gap-3 pt-6">
          {step > 1 && (
            <button onClick={prevStep} className="px-6 py-3.5 rounded-xl border border-white/[0.08] text-white text-sm font-bold bg-white/[0.02] hover:bg-white/[0.06] transition">
              Back
            </button>
          )}
          {step < 5 ? (
            <button onClick={nextStep} disabled={step === 1 && !formData.title} className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-luxury-gold to-[#b8860b] text-black text-sm font-bold shadow-lg transition hover:scale-[1.02] disabled:opacity-50 flex justify-center items-center gap-2">
              Next Step <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-700 text-white text-sm font-bold shadow-lg transition hover:scale-[1.02] disabled:opacity-50 flex justify-center items-center gap-2">
              {loading ? "Submitting..." : "Submit Report"} <CheckCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Success Screen */}
      {step === 6 && (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(52,211,153,0.3)]">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white font-playfair uppercase tracking-wide mb-2">Report Submitted!</h2>
          <p className="text-sm text-gray-400 mb-8 max-w-[250px]">Your field assessment has been successfully logged and sent to the Command Center.</p>
          <Link href="/field/dashboard">
            <button className="px-8 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white font-bold hover:bg-white/[0.1] transition">
              Return to Dashboard
            </button>
          </Link>
        </div>
      )}

    </div>
  );
}
