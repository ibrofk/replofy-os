import React, { useEffect, useMemo, useState } from 'react';
import { Bot, ExternalLink, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AIAttachmentPicker } from './AIAttachmentPicker';
import { AIContextModePicker, AIContextStatsSummary, contextModeDetails } from './AIContextModePicker';
import { standaloneClient, type AIContextAttachment, type AIContextMode, type AIContextStats } from '../../services/standaloneClient';

type AIStatus = Awaited<ReturnType<typeof standaloneClient.getAIStatus>>;

export function StandaloneAIContextPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AIContextAttachment[]>([]);
  const [answer, setAnswer] = useState('');
  const [contextMode, setContextMode] = useState<AIContextMode>('focused');
  const [contextStats, setContextStats] = useState<AIContextStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const routeLabel = useMemo(() => {
    const value = location.pathname.replace(/^\//, '').replace(/[-/]/g, ' ');
    return value ? value.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Workspace';
  }, [location.pathname]);

  useEffect(() => {
    let mounted = true;
    setSessionId(null);
    setAnswer('');
    setAttachments([]);
    setContextStats(null);
    setError(null);
    void standaloneClient.getAIStatus()
      .then((nextStatus) => {
        if (mounted) setStatus(nextStatus);
      })
      .catch(() => {
        if (mounted) setStatus(null);
      });
    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'a' && event.shiftKey && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = prompt.trim() || (attachments.length > 0 ? 'Analyze the attached files and answer the request.' : '');
    if (!content || busy) return;
    if (!status?.active) {
      setError('Configure provider and model first.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const session = await standaloneClient.createAIChatSession(`Context: ${routeLabel}`, {
          route: location.pathname,
        });
        currentSessionId = typeof session.id === 'string' ? session.id : null;
        if (!currentSessionId) throw new Error('AI session could not be created.');
        setSessionId(currentSessionId);
      }
      const result = await standaloneClient.sendAIChatMessage(currentSessionId, content, {
        route: location.pathname,
        userPrompt: content,
        attachments,
        metadata: { source: 'contextual-ai-panel', contextMode },
      });
      setAnswer(result.run.output.answer);
      setContextStats(result.run.contextStats ?? null);
      setPrompt('');
      setAttachments([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-zinc-800"
          aria-label="Open contextual AI"
        >
          <Sparkles className="h-4 w-4 text-amber-300" />
          Ask AI <span className="hidden text-[10px] font-medium text-zinc-400 sm:inline">Ctrl+Shift+A</span>
        </button>
      )}

      {open && (
        <aside className="fixed bottom-5 right-5 z-40 flex max-h-[min(680px,calc(100vh-2.5rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-950 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-amber-300" />
              <div>
                <p className="text-sm font-semibold">Contextual AI</p>
                <p className="text-[11px] text-zinc-400">{routeLabel} · workspace scope</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Close AI panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!status?.active ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-950">Configure provider and model first.</p>
                <p className="mt-1 text-xs leading-5 text-amber-900">AI stays fully inactive until this workspace has both settings. Deterministic Replofy features continue normally.</p>
                <button type="button" onClick={() => navigate('/settings')} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800">
                  Open AI settings <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  Active · {status.provider} · {status.model}
                </div>
                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-zinc-800">Context recipe</p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">Choose how much workspace evidence this answer should use.</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-zinc-500">{contextModeDetails[contextMode].summary}</span>
                  </div>
                  <div className="mt-3"><AIContextModePicker value={contextMode} onChange={setContextMode} compact /></div>
                  <p className="mt-2 text-[11px] leading-5 text-zinc-500">{contextModeDetails[contextMode].description}</p>
                  <div className="mt-1"><AIContextStatsSummary stats={contextStats} /></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ['Summarize this surface', 'focused'],
                    ['Find missing steps', 'workspace'],
                    ['Create a proposal', 'deep'],
                  ].map(([quickPrompt, quickMode]) => (
                    <button key={quickPrompt} type="button" onClick={() => { setPrompt(quickPrompt); setContextMode(quickMode as AIContextMode); }} className="rounded-full border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100">{quickPrompt}</button>
                  ))}
                </div>
                {answer && <div className="mt-3 rounded-xl bg-zinc-100 p-3 text-sm leading-6 text-zinc-800"><p>{answer}</p><div className="mt-2"><AIContextStatsSummary stats={contextStats} /></div></div>}
                {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
              </>
            )}
          </div>

          <form onSubmit={send} className="border-t border-zinc-100 p-3">
            <AIAttachmentPicker attachments={attachments} onChange={setAttachments} onError={setError} disabled={!status?.active || busy} />
            <div className="flex items-end gap-2">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={2}
                placeholder={status?.active ? `Ask about ${routeLabel.toLowerCase()} or attach files…` : 'AI is inactive'}
                disabled={!status?.active || busy}
                className="min-h-14 flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-50"
              />
              <button type="submit" disabled={!status?.active || busy || (!prompt.trim() && attachments.length === 0)} className="rounded-xl bg-zinc-950 p-3 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send to AI">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </aside>
      )}
    </>
  );
}
