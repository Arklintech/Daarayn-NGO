'use client';

import React, { useState, useEffect } from "react";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { 
  FolderHeart, 
  GraduationCap, 
  Home as HomeIcon,
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  Save, 
  X, 
  IndianRupee,
  MapPin,
  TrendingUp,
  Award,
  Upload,
  Clock,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminPrograms() {
  const [activeTab, setActiveTab] = useState<"family" | "quran" | "masjid">("family");
  const [loading, setLoading] = useState(true);
  
  // Storage lists
  const [familyCases, setFamilyCases] = useState<any[]>([]);
  const [quranStudents, setQuranStudents] = useState<any[]>([]);
  const [masjidProjects, setMasjidProjects] = useState<any[]>([]);

  // Modals / Editor States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "update">("create");
  const [currentId, setCurrentId] = useState<string | null>(null);
  
  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);

  // Form State
  const [formState, setFormState] = useState<any>({
    title: "",
    description: "",
    location: "",
    amountRequired: 0,
    amountCollected: 0,
    amountDistributed: 0,
    progress: 0,
    status: "Active",
    beneficiaryName: "",
    beneficiaryContact: "",
    targetJuz: 30,
    memorizedJuz: 0,
    contractorName: "",
    imageUrl: "",
    docUrl: ""
  });

  // Load programs on mount
  useEffect(() => {
    async function fetchAllPrograms() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "causes"));
        const casesList: any[] = [];
        const studentsList: any[] = [];
        const projectsList: any[] = [];

        snap.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() } as any;
          if (data.type === "family" || data.category === "Relief") casesList.push(data);
          else if (data.type === "quran" || data.category === "Education") studentsList.push(data);
          else if (data.type === "masjid" || data.category === "Community") projectsList.push(data);
        });

        setFamilyCases(casesList);
        setQuranStudents(studentsList);
        setMasjidProjects(projectsList);
      } catch (err) {
        console.error("Error fetching programs list from Firestore:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAllPrograms();
  }, [isEditorOpen]);

  const handleOpenEditor = (mode: "create" | "update", item?: any) => {
    setEditMode(mode);
    if (mode === "update" && item) {
      setCurrentId(item.id);
      setFormState({ ...item });
    } else {
      setCurrentId(null);
      setFormState({
        title: "",
        description: "",
        location: "",
        amountRequired: 0,
        amountCollected: 0,
        amountDistributed: 0,
        progress: 0,
        status: "Active",
        beneficiaryName: "",
        beneficiaryContact: "",
        targetJuz: 30,
        memorizedJuz: 0,
        contractorName: "",
        imageUrl: "",
        docUrl: ""
      });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const generatedId = currentId || `${activeTab}_${Date.now()}`;
      const slug = formState.title ? formState.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : generatedId;
      const finalRecord = {
        ...formState,
        id: generatedId,
        type: activeTab,
        name: formState.title,
        slug: slug,
        goalAmount: Number(formState.amountRequired || 0),
        raisedAmount: Number(formState.amountCollected || 0),
        category: activeTab === 'family' ? 'Relief' : activeTab === 'quran' ? 'Education' : 'Community',
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "causes", generatedId), finalRecord);
      setIsEditorOpen(false);
    } catch (err) {
      console.error("Save program error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this program?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "causes", id));
      // Trigger local updates
      setFamilyCases(prev => prev.filter(c => c.id !== id));
      setQuranStudents(prev => prev.filter(c => c.id !== id));
      setMasjidProjects(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetField: "imageUrl" | "docUrl") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const storageRef = ref(storage, `programs/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snap.ref);
      setFormState(prev => ({ ...prev, [targetField]: downloadUrl }));
    } catch (err) {
      console.error("File upload failed:", err);
    } finally {
      setUploadingFile(false);
    }
  };

  const currentList = 
    activeTab === "family" ? familyCases : 
    activeTab === "quran" ? quranStudents : 
    masjidProjects;

  return (
    <div className="space-y-6">
      {/* Category selector tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex rounded-xl bg-white/[0.02] border border-white/[0.06] p-1.5 w-full sm:w-auto">
          {[
            { id: "family", label: "Family Relief", icon: FolderHeart },
            { id: "quran", label: "Qur'an Sponsorship", icon: GraduationCap },
            { id: "masjid", label: "Masjid Infrastructure", icon: HomeIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg text-xs font-semibold w-full sm:w-auto transition ${
                  activeTab === tab.id 
                    ? "bg-luxury-ivory text-black shadow-md"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <button 
          onClick={() => handleOpenEditor("create")}
          className="flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold text-xs tracking-wider transition w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" /> Add Program Case
        </button>
      </div>

      {/* Loading Skeletons */}
      {loading && currentList.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-48 rounded-3xl admin-glass animate-pulse"></div>
          <div className="h-48 rounded-3xl admin-glass animate-pulse"></div>
        </div>
      ) : (
        /* Dynamic Case grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {currentList.map((item) => (
            <motion.div
              layoutId={item.id}
              key={item.id}
              className="rounded-3xl admin-glass border border-white/[0.06] overflow-hidden flex flex-col hover:border-luxury-ivory/20 transition duration-300 relative group"
            >
              {/* Image banner */}
              <div className="h-40 bg-luxury-bg-deep/40 relative overflow-hidden flex items-center justify-center border-b border-white/[0.04]">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                  <div className="text-center text-gray-600">
                    <FolderHeart className="w-10 h-10 mx-auto opacity-30 mb-2" />
                    <span className="text-[10px]">No image uploaded</span>
                  </div>
                )}
                {/* Status chip */}
                <span className={`absolute top-4 right-4 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                  item.status === "Active" 
                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                    : "bg-gray-800 text-gray-400 border-white/[0.08]"
                }`}>
                  {item.status}
                </span>
              </div>

              {/* Card Body */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide font-playfair">{item.title}</h3>
                  <p className="text-[11px] text-gray-400 mt-2 line-clamp-3 leading-relaxed">{item.description}</p>
                </div>

                {/* Case Stats specific to type */}
                <div className="space-y-3 pt-2">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-[9px] font-semibold text-gray-400 mb-1">
                      <span>FUNDING DRIVE PROGRESS</span>
                      <span className="text-white">{item.progress || 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full bg-luxury-ivory rounded-full" style={{ width: `${item.progress || 0}%` }}></div>
                    </div>
                  </div>

                  {/* Program values */}
                  <div className="grid grid-cols-2 gap-3 text-[10px] font-semibold">
                    <div className="p-2.5 rounded-xl bg-white/[0.01] border border-white/[0.04]">
                      <span className="text-gray-500 block uppercase text-[8px] tracking-wider">Goal Required</span>
                      <span className="text-white font-bold block mt-0.5">₹{(item.amountRequired || 0).toLocaleString()}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.01] border border-white/[0.04]">
                      <span className="text-gray-500 block uppercase text-[8px] tracking-wider">Collected</span>
                      <span className="text-luxury-ivory font-bold block mt-0.5">₹{(item.amountCollected || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action bar */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
                  <button 
                    onClick={() => handleOpenEditor("update", item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-[10px] font-bold text-white transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit Case
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-2 rounded-xl bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition"
                    aria-label="Delete case"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Program Editor Overlay Modal */}
      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditorOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-3xl admin-glass border border-white/[0.08] relative z-10 text-xs"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
                <div>
                  <h3 className="text-base font-bold text-white font-playfair uppercase tracking-wider">
                    {editMode === "create" ? "Add New Program Case" : "Modify Program Details"}
                  </h3>
                  <span className="text-[9px] text-luxury-ivory font-bold tracking-widest uppercase block mt-0.5">
                    Category: {activeTab}
                  </span>
                </div>
                <button 
                  onClick={() => setIsEditorOpen(false)}
                  className="p-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                {/* General Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Case Title / Name</label>
                    <input 
                      type="text" 
                      required
                      value={formState.title}
                      onChange={(e) => setFormState(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Family Relief Bundle (Case DA004)"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Description</label>
                    <textarea 
                      rows={3}
                      required
                      value={formState.description}
                      onChange={(e) => setFormState(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Detailed background information..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                    />
                  </div>

                  {activeTab !== "quran" && (
                    <div>
                      <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Location</label>
                      <input 
                        type="text" 
                        value={formState.location}
                        onChange={(e) => setFormState(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="City, State"
                        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Status</label>
                    <select 
                      value={formState.status}
                      onChange={(e) => setFormState(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#06120c] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                    >
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                      <option value="Archived">Archived</option>
                    </select>
                  </div>
                </div>

                {/* Financial Fields */}
                <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04] space-y-4">
                  <h4 className="text-[10px] font-bold text-luxury-ivory uppercase tracking-wider">Financial Targets</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Goal Required (₹)</label>
                      <input 
                        type="number" 
                        value={formState.amountRequired}
                        onChange={(e) => setFormState(prev => ({ ...prev, amountRequired: Number(e.target.value) }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Amount Collected (₹)</label>
                      <input 
                        type="number" 
                        value={formState.amountCollected}
                        onChange={(e) => setFormState(prev => ({ ...prev, amountCollected: Number(e.target.value) }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Progress Percentage (%)</label>
                      <input 
                        type="number" 
                        max={100}
                        value={formState.progress}
                        onChange={(e) => setFormState(prev => ({ ...prev, progress: Number(e.target.value) }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Category specific fields */}
                {activeTab === "family" && (
                  <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04] grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-3">
                      <h4 className="text-[10px] font-bold text-luxury-ivory uppercase tracking-wider">Beneficiary Details</h4>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Beneficiary Name</label>
                      <input 
                        type="text" 
                        value={formState.beneficiaryName}
                        onChange={(e) => setFormState(prev => ({ ...prev, beneficiaryName: e.target.value }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Beneficiary Contact</label>
                      <input 
                        type="text" 
                        value={formState.beneficiaryContact}
                        onChange={(e) => setFormState(prev => ({ ...prev, beneficiaryContact: e.target.value }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Amount Distributed (₹)</label>
                      <input 
                        type="number" 
                        value={formState.amountDistributed}
                        onChange={(e) => setFormState(prev => ({ ...prev, amountDistributed: Number(e.target.value) }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                      />
                    </div>
                  </div>
                )}

                {activeTab === "quran" && (
                  <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04] grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-3">
                      <h4 className="text-[10px] font-bold text-luxury-ivory uppercase tracking-wider">Student Progress Targets</h4>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Student Name</label>
                      <input 
                        type="text" 
                        value={formState.beneficiaryName}
                        onChange={(e) => setFormState(prev => ({ ...prev, beneficiaryName: e.target.value }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Juz Target</label>
                      <input 
                        type="number" 
                        value={formState.targetJuz}
                        onChange={(e) => setFormState(prev => ({ ...prev, targetJuz: Number(e.target.value) }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Juz Memorized</label>
                      <input 
                        type="number" 
                        value={formState.memorizedJuz}
                        onChange={(e) => setFormState(prev => ({ ...prev, memorizedJuz: Number(e.target.value) }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                      />
                    </div>
                  </div>
                )}

                {activeTab === "masjid" && (
                  <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04] grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <h4 className="text-[10px] font-bold text-luxury-ivory uppercase tracking-wider">Masjid Construction Contractors</h4>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1.5 uppercase text-[9px]">Contractor Company Name</label>
                      <input 
                        type="text" 
                        value={formState.contractorName}
                        onChange={(e) => setFormState(prev => ({ ...prev, contractorName: e.target.value }))}
                        className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Media Attachment fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4.5 rounded-2xl bg-white/[0.01] border border-white/[0.04] flex flex-col justify-between">
                    <div>
                      <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Case Photo</label>
                      <span className="text-[9px] text-gray-500 mb-3 block">Upload JPEG/PNG case banner</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] font-bold text-[10px] text-white cursor-pointer transition flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingFile ? "Uploading..." : "Select Image"}
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleFileUpload(e, "imageUrl")}
                          className="hidden" 
                        />
                      </label>
                      {formState.imageUrl && (
                        <span className="text-[10px] text-emerald-400 truncate max-w-[150px]">Image uploaded</span>
                      )}
                    </div>
                  </div>

                  <div className="p-4.5 rounded-2xl bg-white/[0.01] border border-white/[0.04] flex flex-col justify-between">
                    <div>
                      <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Documentation PDF</label>
                      <span className="text-[9px] text-gray-500 mb-3 block">Verification or budget certificates</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] font-bold text-[10px] text-white cursor-pointer transition flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingFile ? "Uploading..." : "Select PDF File"}
                        <input 
                          type="file" 
                          accept="application/pdf" 
                          onChange={(e) => handleFileUpload(e, "docUrl")}
                          className="hidden" 
                        />
                      </label>
                      {formState.docUrl && (
                        <span className="text-[10px] text-emerald-400 truncate max-w-[150px]">PDF linked</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form Footer */}
                <div className="flex items-center gap-3 pt-6 border-t border-white/[0.06] justify-end">
                  <button 
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] font-bold text-gray-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white text-black font-semibold tracking-wide transition flex items-center gap-1.5 shadow-lg"
                  >
                    <Save className="w-4 h-4" /> Save Details
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
