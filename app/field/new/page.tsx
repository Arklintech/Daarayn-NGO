'use client';

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { ArrowLeft, Check, ArrowRight, UploadCloud, MapPin, CheckCircle } from "lucide-react";

const STEPS = [
  { id: 1, title: 'Basic Information' },
  { id: 2, title: 'Location Details' },
  { id: 3, title: 'Need Information' },
  { id: 4, title: 'Media & Documents' },
  { id: 5, title: 'Review & Submit' }
];

export default function SubmitFieldReport() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    category: 'Masjid',
    title: '',
    description: '',
    urgency: 'Medium',
    estimatedBudget: '',
    location: { state: '', district: '', village: '', gps: '' },
    beneficiaries: { families: '', details: '' },
  });

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 5));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const reportId = `FR-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      const payload = {
        id: reportId,
        ...formData,
        status: 'Pending Review',
        submittedBy: 'Abdul Rahman',
        fieldAgentId: 'FA-2026-001',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'field_reports', reportId), payload);
      
      alert(`Report ${reportId} submitted successfully! HQ will review it shortly.`);
      router.push('/field');
    } catch (err) {
      console.error(err);
      alert('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 rounded-full transition">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-cinzel)' }}>REPORT NEW NEED</h1>
          <p className="text-sm text-gray-500 mt-1">Please provide accurate information so we can verify and help.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 flex-1">
        
        {/* Left Progress Steps */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="flex md:flex-col gap-6 overflow-x-auto no-scrollbar md:pr-4 pb-4 md:pb-0 relative">
            <div className="hidden md:block absolute left-4 top-4 bottom-4 w-px bg-white/5 z-0" />
            
            {STEPS.map((step) => {
              const isActive = currentStep === step.id;
              const isPast = currentStep > step.id;
              return (
                <div key={step.id} className="flex items-center gap-4 flex-shrink-0 relative z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border shadow-lg ${
                    isActive ? 'bg-[#080e1f] text-luxury-gold border-luxury-gold shadow-[0_0_15px_rgba(212,175,55,0.4)]' : 
                    isPast ? 'bg-luxury-gold/20 text-luxury-gold border-luxury-gold/50' : 
                    'bg-[#080e1f] border-white/10 text-gray-500'
                  }`}>
                    {isPast ? <Check className="w-4 h-4" /> : step.id}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? 'text-luxury-ivory' : isPast ? 'text-gray-300' : 'text-gray-600'}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Form Area */}
        <div className="flex-1">
          <div className="admin-glass border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-luxury-gold/0 via-luxury-gold to-luxury-gold/0 opacity-20" />
            
            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Basic Information</h2>
                  <p className="text-sm text-gray-400 mt-1">Tell us what kind of help is needed.</p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Category <span className="text-luxury-gold">*</span></label>
                    <select 
                      value={formData.category} 
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold appearance-none"
                    >
                      <option value="Masjid" className="bg-[#080e1f]">Masjid</option>
                      <option value="Education" className="bg-[#080e1f]">Education</option>
                      <option value="Water" className="bg-[#080e1f]">Water Well</option>
                      <option value="Health" className="bg-[#080e1f]">Medical</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Need Title <span className="text-luxury-gold">*</span></label>
                    <input 
                      type="text" 
                      placeholder="e.g., Masjid Roof Repair"
                      value={formData.title} 
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Short Description <span className="text-luxury-gold">*</span></label>
                    <textarea 
                      placeholder="Briefly describe the need..."
                      rows={4}
                      value={formData.description} 
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Location Details */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Location Details</h2>
                  <p className="text-sm text-gray-400 mt-1">Where is this intervention required?</p>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">State / Province</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Telangana"
                        value={formData.location.state} 
                        onChange={(e) => setFormData({...formData, location: {...formData.location, state: e.target.value}})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">District</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Hyderabad"
                        value={formData.location.district} 
                        onChange={(e) => setFormData({...formData, location: {...formData.location, district: e.target.value}})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Full Address / Village</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Old City, near Charminar"
                      value={formData.location.village} 
                      onChange={(e) => setFormData({...formData, location: {...formData.location, village: e.target.value}})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">GPS Coordinates</label>
                      <button className="text-[10px] text-luxury-gold hover:underline">Auto-detect GPS</button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="e.g. 17.3616, 78.4747"
                      value={formData.location.gps} 
                      onChange={(e) => setFormData({...formData, location: {...formData.location, gps: e.target.value}})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold font-mono"
                    />
                  </div>
                  
                  <div className="h-40 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                    <p className="text-sm text-gray-500 flex items-center gap-2"><MapPin className="w-4 h-4" /> Map Integration Placeholder</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Need Information */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Need Information</h2>
                  <p className="text-sm text-gray-400 mt-1">Urgency and budget estimates.</p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Urgency Level <span className="text-luxury-gold">*</span></label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {['Low', 'Medium', 'High', 'Critical'].map((level) => (
                        <label key={level} className={`flex items-center gap-2 px-4 py-3 border rounded-xl cursor-pointer transition ${
                          formData.urgency === level ? 'border-luxury-gold bg-luxury-gold/10' : 'border-white/10 hover:bg-white/5'
                        }`}>
                          <input 
                            type="radio" 
                            name="urgency" 
                            value={level}
                            checked={formData.urgency === level}
                            onChange={(e) => setFormData({...formData, urgency: e.target.value})}
                            className="hidden" 
                          />
                          <span className={`w-2 h-2 rounded-full ${
                            level === 'Low' ? 'bg-green-400' :
                            level === 'Medium' ? 'bg-amber-400' :
                            level === 'High' ? 'bg-orange-500' : 'bg-red-500'
                          }`}></span>
                          <span className="text-sm text-white font-medium">{level}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-4">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Estimated Budget (INR)</label>
                    <input 
                      type="number" 
                      placeholder="e.g., 250000"
                      value={formData.estimatedBudget} 
                      onChange={(e) => setFormData({...formData, estimatedBudget: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold text-lg font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 pt-4">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Estimated Beneficiaries (Families)</label>
                    <input 
                      type="number" 
                      placeholder="e.g., 50"
                      value={formData.beneficiaries.families} 
                      onChange={(e) => setFormData({...formData, beneficiaries: {...formData.beneficiaries, families: e.target.value}})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-luxury-gold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Media */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Media & Documents</h2>
                  <p className="text-sm text-gray-400 mt-1">Upload high-quality images and videos from the field.</p>
                </div>
                
                <div className="border-2 border-dashed border-white/20 hover:border-luxury-gold/50 transition rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer bg-white/[0.02]">
                  <UploadCloud className="w-10 h-10 text-gray-500 mb-4" />
                  <p className="text-sm font-medium text-white">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-500 mt-2">SVG, PNG, JPG or MP4 (max. 50MB)</p>
                  <button className="mt-6 px-6 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition">
                    Browse Files
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Review & Submit */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Review & Submit</h2>
                  <p className="text-sm text-gray-400 mt-1">Please confirm the details below.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                    <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Report Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Title:</span> <span className="text-white font-medium">{formData.title || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Category:</span> <span className="text-white">{formData.category || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Urgency:</span> <span className="text-luxury-gold">{formData.urgency}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Est. Budget:</span> <span className="text-white">₹{formData.estimatedBudget || '0'}</span></div>
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                    <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Location</h4>
                    <p className="text-sm text-white">{formData.location.village ? `${formData.location.village}, ` : ''}{formData.location.district}, {formData.location.state}</p>
                  </div>
                </div>

                <div className="bg-luxury-gold/10 border border-luxury-gold/30 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-luxury-gold mb-2">Ready to submit?</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    By submitting this report, you confirm that the information provided is accurate and gathered from direct field observation. Headquarters will be notified immediately.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-white/10 flex justify-between">
               <button 
                onClick={prevStep}
                disabled={currentStep === 1 || isSubmitting}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition ${
                  currentStep === 1 ? 'opacity-0 pointer-events-none' : 'text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10'
                }`}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              
              {currentStep < 5 ? (
                <button 
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-2.5 bg-luxury-gold hover:bg-luxury-gold/90 text-[#080e1f] rounded-xl text-sm font-bold transition shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                >
                  Next Step <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-8 py-2.5 bg-luxury-gold hover:bg-luxury-gold/90 text-[#080e1f] rounded-xl text-sm font-bold transition shadow-[0_0_15px_rgba(212,175,55,0.3)] disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <><div className="w-4 h-4 border-2 border-[#080e1f] border-t-transparent rounded-full animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4" /> Submit Report</>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
