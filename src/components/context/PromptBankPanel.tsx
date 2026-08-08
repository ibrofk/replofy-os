import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useUser } from '../../contexts/UserContext';
import { Prompt } from '../../types';
import { handleFirestoreError, logFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { Database, Plus, Search, Copy, Check, Edit2, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';

export function PromptBankPanel() {
  const { userProfile } = useUser();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newVersion, setNewVersion] = useState('v1.0');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;

    const scopeQuery = userProfile?.companyId
      ? query(collection(db, 'prompts'), where('companyId', '==', userProfile.companyId))
      : query(collection(db, 'prompts'), where('authorId', '==', auth.currentUser.uid));

    const unsubscribe = onSnapshot(
      scopeQuery,
      (snapshot) => {
        const data = snapshot.docs.map((snap) => ({
          id: snap.id,
          ...snap.data(),
        })) as Prompt[];
        setPrompts(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'prompts');
      }
    );

    return unsubscribe;
  }, [userProfile?.companyId]);

  const filteredPrompts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter(
      (p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.version.toLowerCase().includes(q)
    );
  }, [search, prompts]);

  const resetForm = () => {
    setNewTitle('');
    setNewVersion('v1.0');
    setNewContent('');
    setEditingId(null);
    setShowCreate(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || !auth.currentUser) return;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'prompts', editingId), {
          title: newTitle,
          version: newVersion,
          content: newContent,
        });
      } else {
        await addDoc(collection(db, 'prompts'), {
          title: newTitle,
          version: newVersion,
          content: newContent,
          createdAt: new Date().toISOString(),
          authorId: auth.currentUser.uid,
          companyId: userProfile?.companyId || null,
        });
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'prompts');
    }
  };

  const startEditing = (prompt: Prompt) => {
    setEditingId(prompt.id);
    setNewTitle(prompt.title);
    setNewVersion(prompt.version);
    setNewContent(prompt.content);
    setShowCreate(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'prompts', id));
      if (editingId === id) resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `prompts/${id}`);
    }
  };

  const handleCopy = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const promptCount = prompts.length;

  return (
    <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
            <Database className="h-3.5 w-3.5" />
            Prompt Bank
          </div>
          <h2 className="mt-3 text-lg font-black tracking-tight text-zinc-900">Golden Prompt Library</h2>
          <p className="mt-1 text-sm text-zinc-500">Create, version, and reuse prompts across your team.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">Total</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-zinc-900">{promptCount}</p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts..."
            className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-10 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
          />
        </div>
        <button
          onClick={() => {
            if (showCreate && !editingId) {
              setShowCreate(false);
            } else {
              resetForm();
              setShowCreate(true);
            }
          }}
          className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
            showCreate && !editingId
              ? 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
              : 'bg-zinc-900 text-white hover:bg-zinc-800'
          }`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5">
          <div className="flex gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Prompt title..."
              className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              autoFocus
            />
            <input
              type="text"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="v1.0"
              className="w-20 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Enter prompt content..."
            rows={6}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-2xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
            >
              {editingId ? 'Update Prompt' : 'Save Prompt'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {filteredPrompts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
            {search ? 'No prompts match your search.' : 'No prompts yet. Create your first golden prompt.'}
          </div>
        ) : (
          filteredPrompts.map((prompt) => (
            <div
              key={prompt.id}
              className={`group rounded-2xl border transition-all ${
                editingId === prompt.id ? 'border-zinc-400 ring-1 ring-zinc-400/20' : 'border-zinc-200 hover:border-zinc-300'
              } bg-zinc-50/50`}
            >
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-zinc-900 truncate">{prompt.title}</h3>
                    <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.24em] text-white">
                      {prompt.version}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    Created {new Date(prompt.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(prompt.id, prompt.content)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors"
                    title="Copy"
                  >
                    {copiedId === prompt.id ? <Check className="h-3.5 w-3.5 text-zinc-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => startEditing(prompt)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(prompt.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === prompt.id ? null : prompt.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors"
                    title={expandedId === prompt.id ? 'Collapse' : 'Expand'}
                  >
                    {expandedId === prompt.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {expandedId === prompt.id && (
                <div className="border-t border-zinc-200 bg-white/60 p-4">
                  <pre className="text-xs font-mono text-zinc-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {prompt.content}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
