import React, { useState, useEffect } from 'react';
import { Database, Copy, Check } from 'lucide-react';
import { collection, query, onSnapshot, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Prompt } from '../../types';
import { useUser } from '../../contexts/UserContext';

export function InternalPromptBankWidget() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { userProfile } = useUser();

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const baseQuery = userProfile?.companyId
      ? where('companyId', '==', userProfile.companyId)
      : where('authorId', '==', auth.currentUser.uid);

    const q = query(
      collection(db, 'prompts'),
      baseQuery,
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const promptsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Prompt[];
      setPrompts(promptsData);
    });

    return unsubscribe;
  }, [userProfile?.companyId]);

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bento-card col-span-1 md:col-span-1 lg:col-span-1">
      <div className="bento-title">
        <Database className="w-4 h-4 text-zinc-600" />
        Internal Prompt Bank
      </div>
      
      <div className="flex flex-col h-full justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight mb-4 text-gray-900">Golden Prompts</h3>
          
          <div className="space-y-2">
            {prompts.map((prompt) => (
              <div key={prompt.id} className="flex items-center justify-between p-2.5 rounded-2xl bg-gray-50 border border-gray-200 hover:border-gray-300 transition-colors group">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{prompt.title}</p>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.24em] truncate">v{prompt.version}</p>
                </div>
                <button 
                  onClick={() => handleCopy(prompt.id, prompt.content)}
                  className="p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-zinc-600 transition-colors shrink-0"
                  title="Copy prompt"
                >
                  {copiedId === prompt.id ? (
                    <Check className="w-3.5 h-3.5 text-zinc-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
            {prompts.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No prompts yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
