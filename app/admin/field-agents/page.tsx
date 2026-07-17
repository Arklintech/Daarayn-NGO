'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { 
  Users, UserPlus, MapPin, Search, ShieldCheck, Mail, Phone,
  Eye, CheckCircle, AlertCircle, X, Trash2, Key, RefreshCw, EyeOff
} from "lucide-react";
import Link from "next/link";
import { FieldAgent as BaseFieldAgent } from "@/lib/db-field-ops";

interface FieldAgent extends BaseFieldAgent {
  rawPassword?: string;
}

export default function FieldAgentManagement() {
  const [agents, setAgents] = useState<FieldAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const loadAgents = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "field_agents"));
      const list: FieldAgent[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as FieldAgent);
      });
      setAgents(list);
    } catch (err) {
      console.warn("Agents read error", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (confirm("Are you sure you want to delete this field agent? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "field_agents", agentId));
        setAgents(prev => prev.filter(a => a.id !== agentId));
      } catch (err) {
        console.error("Error deleting agent:", err);
      }
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleResetPassword = async (email: string, id: string) => {
    const newPass = prompt(`Set a new password for ${email}:\n(This will update their password in the Portal Database directly)`);
    if (!newPass) return;
    if (newPass.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    
    setResettingId(id);
    try {
      // Update directly in Firestore since Firebase Email/Password Auth is disabled on the project
      await updateDoc(doc(db, "field_agents", id), {
        rawPassword: newPass,
        requirePasswordChange: true
      });
      
      // Update local state to show it immediately
      setAgents(prev => prev.map(a => a.id === id ? { ...a, rawPassword: newPass, requirePasswordChange: true } : a));
      
      alert(`Password updated successfully. Field agent can now log in with the new password.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to update password: " + err.message);
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="space-y-6 text-xs max-w-[1600px] mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-luxury-gold font-playfair tracking-wide uppercase">Field Agent IAM Center</h2>
          <p className="text-xs text-gray-400 mt-1">Manage Field Agent identities, access control, and operational regions.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-gradient-to-r from-luxury-gold to-[#b8860b] text-black px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition hover:scale-105 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
        >
          <UserPlus className="w-4 h-4" />
          Create Field Agent
        </button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search by name, ID or region..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-luxury-gold/50 transition-all"
          />
        </div>
      </div>

      <div className="rounded-2xl admin-glass border border-white/[0.06] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-gray-500 font-semibold uppercase tracking-wider text-[10px] bg-white/[0.01]">
                <th className="p-4">Identity</th>
                <th className="p-4">Region & Role</th>
                <th className="p-4">Security</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">Loading Identities...</td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">No identities found.</td>
                </tr>
              ) : (
                filteredAgents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold font-bold text-sm">
                          {agent.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-white font-medium text-[13px]">{agent.name}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-0.5">{agent.id}</div>
                          <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5"/> {agent.phone}</span>
                            <span className="flex items-center gap-1"><Mail className="w-2.5 h-2.5"/> {agent.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-white text-[12px] flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-500"/> {agent.region}</div>
                      <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-luxury-gold/70"/> {agent.role}</div>
                    </td>
                    <td className="p-4">
                       <div className="flex flex-col gap-1.5">
                         {agent.firebaseUid ? (
                           <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle className="w-3 h-3"/> Provisioned</span>
                         ) : (
                           <span className="inline-flex items-center gap-1 text-[10px] text-red-400"><AlertCircle className="w-3 h-3"/> Unlinked</span>
                         )}
                         <div className="flex items-center gap-2 mt-1">
                           <span className="text-[10px] text-gray-400 flex items-center gap-1">
                             <Key className="w-3 h-3"/> 
                             {agent.rawPassword ? (visiblePasswords[agent.id] ? agent.rawPassword : "••••••••") : "Not Set"}
                           </span>
                           {agent.rawPassword && (
                             <button 
                               onClick={() => togglePasswordVisibility(agent.id)}
                               className="text-gray-500 hover:text-white transition"
                               title="Toggle Password Visibility"
                             >
                               {visiblePasswords[agent.id] ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
                             </button>
                           )}
                         </div>
                         {agent.requirePasswordChange && (
                           <span className="inline-flex items-center gap-1 text-[9px] text-amber-400 mt-1">Requires Pwd Change</span>
                         )}
                       </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-semibold border ${
                        agent.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                        agent.status === 'Suspended' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                        'bg-gray-500/10 text-gray-400 border-gray-500/20'
                      }`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleResetPassword(agent.email, agent.id)}
                          disabled={resettingId === agent.id}
                          className="inline-flex items-center justify-center p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition disabled:opacity-50"
                          title="Send Password Reset Email"
                        >
                          <RefreshCw className={`w-4 h-4 ${resettingId === agent.id ? "animate-spin" : ""}`} />
                        </button>
                        <Link 
                          href={`/admin/field-agents/${agent.id}`}
                          className="inline-flex items-center justify-center p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] transition"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDeleteAgent(agent.id)}
                          className="inline-flex items-center justify-center p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition"
                          title="Delete Agent"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreateIAMAgentModal onClose={() => setShowCreateModal(false)} onCreated={loadAgents} />
      )}
    </div>
  );
}

function CreateIAMAgentModal({ onClose, onCreated }: { onClose: () => void, onCreated: () => void }) {
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "",
    country: "India", state: "Telangana", district: "", city: "", address: "",
    role: "Field Officer", region: "", assignedSupervisor: "", status: "Active",
    password: "", confirmPassword: "", requirePasswordChange: true,
    permissions: {
      submitReports: true,
      uploadEvidence: true,
      viewOwnReports: true,
      replyConversations: true,
      receiveNotifications: true
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/admin/field-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, adminId: "Admin_1" })
      });
      const data = await res.json();
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        setError(data.error || "Failed to provision IAM identity.");
      }
    } catch (err) {
      console.error(err);
      setError("A network error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handlePermChange = (key: keyof typeof formData.permissions) => {
    setFormData(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="admin-glass border border-white/[0.08] rounded-2xl w-full max-w-4xl shadow-2xl relative my-auto">
        <div className="p-6 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-black/40 backdrop-blur-md rounded-t-2xl z-10">
          <div>
            <h3 className="text-xl font-bold text-luxury-gold font-playfair uppercase">Provision Field Agent Identity</h3>
            <p className="text-[11px] text-gray-400 mt-1">This will automatically create a Portal Login, Database Record, and Sync bindings.</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-full transition"><X className="w-5 h-5"/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4"/> {error}
            </div>
          )}

          {/* Personal Information */}
          <div>
            <h4 className="text-[13px] font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-luxury-gold"/> Personal Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Email (Username)</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Phone</label>
                <input required type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Country</label>
                <input required type="text" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">State</label>
                <input required type="text" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">District</label>
                <input required type="text" value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">City</label>
                <input required type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Full Address</label>
                <input required type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
            </div>
          </div>

          {/* Organizational Information */}
          <div className="pt-6 border-t border-white/[0.06]">
            <h4 className="text-[13px] font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-luxury-gold"/> Organizational Scope
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Role</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50">
                  <option>Field Officer</option>
                  <option>Regional Coordinator</option>
                  <option>Community Leader</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Assigned Region</label>
                <input required type="text" value={formData.region} onChange={e => setFormData({...formData, region: e.target.value})} placeholder="e.g. Hyderabad South" className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Assigned Supervisor</label>
                <input type="text" value={formData.assignedSupervisor} onChange={e => setFormData({...formData, assignedSupervisor: e.target.value})} placeholder="Supervisor ID/Name" className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50">
                  <option>Active</option>
                  <option>Suspended</option>
                </select>
              </div>
            </div>
          </div>

          {/* Login Credentials & Permissions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-white/[0.06]">
            <div>
              <h4 className="text-[13px] font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-luxury-gold"/> Login Credentials
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Temporary Password</label>
                  <input required type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Confirm Password</label>
                  <input required type="password" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:border-luxury-gold/50" />
                </div>
                <label className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl cursor-pointer hover:bg-white/[0.04] transition">
                  <input type="checkbox" checked={formData.requirePasswordChange} onChange={e => setFormData({...formData, requirePasswordChange: e.target.checked})} className="w-4 h-4 rounded border-gray-600 bg-black/50 accent-luxury-ivory" />
                  <span className="text-[11px] text-gray-300">Force password change on first login</span>
                </label>
              </div>
            </div>
            
            <div>
              <h4 className="text-[13px] font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-luxury-gold"/> Permissions Matrix
              </h4>
              <div className="space-y-2">
                {[
                  { key: 'submitReports', label: 'Submit New Reports' },
                  { key: 'uploadEvidence', label: 'Upload Evidence (Photos/Docs)' },
                  { key: 'viewOwnReports', label: 'View Own Reports History' },
                  { key: 'replyConversations', label: 'Reply to Admin Conversations' },
                  { key: 'receiveNotifications', label: 'Receive System Notifications' }
                ].map(perm => (
                  <label key={perm.key} className="flex items-center gap-3 p-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl cursor-pointer hover:bg-white/[0.04] transition">
                    <input 
                      type="checkbox" 
                      checked={formData.permissions[perm.key as keyof typeof formData.permissions]} 
                      onChange={() => handlePermChange(perm.key as keyof typeof formData.permissions)} 
                      className="w-4 h-4 rounded border-gray-600 bg-black/50 accent-luxury-ivory" 
                    />
                    <span className="text-[11px] text-gray-300">{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-white/[0.06] sticky bottom-0 bg-black/40 backdrop-blur-md p-4 rounded-b-2xl z-10 -mx-6 -mb-6 mt-0">
            <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl border border-white/[0.08] hover:bg-white/[0.04] text-white transition">Cancel</button>
            <button type="submit" disabled={loading} className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-luxury-gold to-[#b8860b] text-black font-bold transition hover:scale-105 disabled:opacity-50">
              {loading ? "Provisioning Identity..." : "Create IAM Identity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
