'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Plus, Trash2, Edit3, Save, X, Lock } from 'lucide-react';

interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: string;
}

export default function AdminNotesTab({ donorId }: any) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const storageKey = `admin_notes_${donorId}`;

  useEffect(() => {
    async function load() {
      try {
        const noteDoc = await getDoc(doc(db, 'admin_notes', donorId));
        if (noteDoc.exists()) {
          setNotes(noteDoc.data().notes || []);
        } else {
          // Fall back to localStorage for offline
          const cached = localStorage.getItem(storageKey);
          if (cached) setNotes(JSON.parse(cached));
        }
      } catch {
        const cached = localStorage.getItem(storageKey);
        if (cached) setNotes(JSON.parse(cached));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [donorId]);

  const persist = async (updated: Note[]) => {
    setNotes(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    try {
      await setDoc(doc(db, 'admin_notes', donorId), { notes: updated, donorId });
    } catch { /* offline graceful */ }
  };

  const addNote = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    const newNote: Note = {
      id: Date.now().toString(),
      content: draft.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: 'Admin',
    };
    await persist([newNote, ...notes]);
    setDraft('');
    setComposing(false);
    setSaving(false);
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    const updated = notes.map(n => n.id === id ? { ...n, content: draft, updatedAt: new Date().toISOString() } : n);
    await persist(updated);
    setEditId(null);
    setDraft('');
    setSaving(false);
  };

  const deleteNote = async (id: string) => {
    await persist(notes.filter(n => n.id !== id));
  };

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Private banner */}
      <div className="flex items-center gap-3 p-4 rounded-2xl"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <Lock className="w-4 h-4 text-red-400 flex-shrink-0" />
        <p className="text-xs text-red-300">
          <strong>Private workspace.</strong> These notes are never shared with donors, never included in emails, and never exposed in donor dashboards.
        </p>
      </div>

      {/* Header + compose */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Admin Notes <span className="text-gray-500 text-sm font-normal ml-1">({notes.length})</span></h2>
        {!composing && (
          <button onClick={() => { setComposing(true); setDraft(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition"
            style={{ background: 'rgba(255,249,221,0.1)', border: '1px solid rgba(255,249,221,0.2)' }}>
            <Plus className="w-4 h-4" /> Add Note
          </button>
        )}
      </div>

      {/* Compose */}
      {composing && (
        <div className="p-4 rounded-2xl space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,249,221,0.15)' }}>
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write an internal note about this donor…"
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none resize-none leading-relaxed"
          />
          <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <button onClick={addNote} disabled={!draft.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition"
              style={{ background: 'rgba(255,249,221,0.12)', border: '1px solid rgba(255,249,221,0.2)' }}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Note'}
            </button>
            <button onClick={() => { setComposing(false); setDraft(''); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-white transition">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="py-10 text-center"><div className="w-6 h-6 border-2 border-luxury-ivory border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : notes.length === 0 ? (
        <div className="text-center py-16 text-gray-500 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Edit3 className="w-8 h-8 mx-auto text-gray-700 mb-2" />
          <p className="text-sm">No admin notes yet.</p>
          <p className="text-xs text-gray-600 mt-1">Add private notes about this donor relationship.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id} className="p-4 rounded-2xl space-y-3"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

              {editId === n.id ? (
                <div className="space-y-3">
                  <textarea
                    autoFocus
                    rows={4}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className="w-full bg-transparent text-sm text-white outline-none resize-none leading-relaxed"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(n.id)} disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition"
                      style={{ background: 'rgba(255,249,221,0.1)', border: '1px solid rgba(255,249,221,0.2)' }}>
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button onClick={() => { setEditId(null); setDraft(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-gray-500 space-x-2 font-mono">
                      <span>{n.author}</span>
                      <span>·</span>
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                      {n.updatedAt !== n.createdAt && <span>(edited)</span>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditId(n.id); setDraft(n.content); }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteNote(n.id)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
