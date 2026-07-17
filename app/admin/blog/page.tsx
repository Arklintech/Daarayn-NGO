'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { 
  PenTool, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  BookOpen, 
  Eye, 
  Check, 
  FileEdit
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminBlog() {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "update">("create");
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Form State
  const [formState, setFormState] = useState<any>({
    title: "",
    content: "",
    author: "",
    tags: "",
    status: "Draft",
    imageUrl: ""
  });

  const loadBlogs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "blogs"));
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setBlogs(list);
    } catch (err) {
      console.warn("Blogs load failed, loading offline mocks:", err);
      const mocks = [
        { id: "blog_1", title: "Transparency in Charity: The Public Ledger Era", content: "Transparency is the bedrock of trust. In this article, we explain how decentralized validation ledger systems enable real-time tracking of public donations.", author: "Daarayn Editorial Team", tags: "Trust, Transparency", status: "Published", createdAt: "2026-07-04T10:00:00Z" },
        { id: "blog_2", title: "Empowering Rural Communities through Clean Water Wells", content: "Clean water changes everything. Over the last quarter, we successfully built 9 clean water tube wells across Bihar villages. This is the story of our volunteers' journey.", author: "Volunteer Team", tags: "Water Projects, Rural Aid", status: "Draft", createdAt: "2026-07-02T15:00:00Z" }
      ];
      setBlogs(mocks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlogs();
  }, []);

  const handleOpenEditor = (mode: "create" | "update", item?: any) => {
    setEditMode(mode);
    if (mode === "update" && item) {
      setCurrentId(item.id);
      setFormState({ ...item });
    } else {
      setCurrentId(null);
      setFormState({
        title: "",
        content: "",
        author: "Daarayn Editorial Team",
        tags: "",
        status: "Draft",
        imageUrl: ""
      });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const generatedId = currentId || `blog_${Date.now()}`;
      await setDoc(doc(db, "blogs", generatedId), {
        id: generatedId,
        ...formState,
        createdAt: formState.createdAt || new Date().toISOString()
      });
      setIsEditorOpen(false);
      loadBlogs();
    } catch (err) {
      console.error("Save blog error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this blog article?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "blogs", id));
      loadBlogs();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">News & Editorial Articles</h2>
          <p className="text-[10px] text-gray-400 mt-0.5 font-medium font-sans">CMS editor for public blogs</p>
        </div>
        <button 
          onClick={() => handleOpenEditor("create")}
          className="flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-gold to-luxury-gold-light hover:brightness-105 active:scale-[0.98] text-black font-semibold transition"
        >
          <Plus className="w-4 h-4" /> Compose Article
        </button>
      </div>

      {/* Blog Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {blogs.map((item) => (
          <motion.div
            key={item.id}
            className="p-5 rounded-3xl admin-glass border border-white/[0.06] flex flex-col justify-between space-y-4 hover:border-luxury-gold/20 transition duration-300"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-bold text-luxury-gold uppercase tracking-widest">{item.tags || "Editorial"}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                  item.status === "Published" 
                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                    : "bg-gray-800 text-gray-400 border-white/[0.08]"
                }`}>
                  {item.status}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white font-playfair">{item.title}</h3>
              <p className="text-gray-400 text-[10px] leading-relaxed mt-2 line-clamp-3">{item.content}</p>
            </div>

            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[10px]">
              <span className="text-gray-500 font-medium">By {item.author}</span>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleOpenEditor("update", item)}
                  className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white transition"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-xl bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Blog Editor Modal */}
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
              className="w-full max-w-xl p-6 rounded-3xl admin-glass border border-white/[0.08] relative z-10 text-xs"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
                <h3 className="text-sm font-bold text-white font-playfair uppercase tracking-wider">
                  {editMode === "create" ? "Compose Blog Article" : "Modify Editorial Page"}
                </h3>
                <button onClick={() => setIsEditorOpen(false)}>
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Article Title</label>
                  <input 
                    type="text" 
                    required
                    value={formState.title}
                    onChange={(e) => setFormState(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Transparency in Charity..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Author Name</label>
                    <input 
                      type="text" 
                      required
                      value={formState.author}
                      onChange={(e) => setFormState(prev => ({ ...prev, author: e.target.value }))}
                      className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Category Tag</label>
                    <input 
                      type="text" 
                      value={formState.tags}
                      onChange={(e) => setFormState(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="e.g. Trust, Rural Aid"
                      className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Status</label>
                  <select 
                    value={formState.status}
                    onChange={(e) => setFormState(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#06120c] border border-white/[0.08] text-white"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Body Content</label>
                  <textarea 
                    rows={6}
                    required
                    value={formState.content}
                    onChange={(e) => setFormState(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Write article details here..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06] justify-end">
                  <button 
                    type="button" 
                    onClick={() => setIsEditorOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-gray-400"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-gold to-luxury-gold-light text-black font-semibold"
                  >
                    Save Article
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
