import React, { useEffect, useState } from 'react';
import { CalendarClock, Lightbulb, MessageSquare, RefreshCw, Send, Target } from 'lucide-react';
import { StudioHeader } from '../components/ui/StudioHeader';
import { standaloneClient, type StandaloneWeekMarker } from '../services/standaloneClient';
import type { Feedback, Prompt, SeoKeyword, SocialPost, TimeBlock } from '../types';

export function StandaloneStrategyPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [keywords, setKeywords] = useState<SeoKeyword[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [weekMarkers, setWeekMarkers] = useState<StandaloneWeekMarker[]>([]);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [socialContent, setSocialContent] = useState('');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [keyword, setKeyword] = useState('');
  const [timeBlockTitle, setTimeBlockTitle] = useState('');
  const [timeBlockStart, setTimeBlockStart] = useState('09:00');
  const [timeBlockEnd, setTimeBlockEnd] = useState('10:00');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [promptResult, socialResult, keywordResult, feedbackResult, timeBlockResult, weekResult] = await Promise.all([
        standaloneClient.listPrompts(),
        standaloneClient.listSocialPosts(),
        standaloneClient.listSeoKeywords(),
        standaloneClient.listFeedback(),
        standaloneClient.listTimeBlocks(),
        standaloneClient.listWeekMarkers(),
      ]);
      setPrompts(promptResult.data);
      setSocialPosts(socialResult.data);
      setKeywords(keywordResult.data);
      setFeedback(feedbackResult.data);
      setTimeBlocks(timeBlockResult.data);
      setWeekMarkers(weekResult.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load strategy records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Strategy update failed.');
    } finally {
      setBusy(false);
    }
  };

  const createPrompt = (event: React.FormEvent) => {
    event.preventDefault();
    if (!promptTitle.trim() || !promptContent.trim()) return;
    void run(async () => {
      await standaloneClient.createPrompt({ title: promptTitle.trim(), content: promptContent });
      setPromptTitle('');
      setPromptContent('');
    });
  };

  const createSocialPost = (event: React.FormEvent) => {
    event.preventDefault();
    if (!socialContent.trim()) return;
    void run(async () => {
      await standaloneClient.createSocialPost({ content: socialContent, platform: 'LinkedIn', status: 'draft' });
      setSocialContent('');
    });
  };

  const createFeedback = (event: React.FormEvent) => {
    event.preventDefault();
    if (!feedbackContent.trim()) return;
    void run(async () => {
      await standaloneClient.createFeedback({ content: feedbackContent, source: 'Email', sentiment: 'neutral' });
      setFeedbackContent('');
    });
  };

  const createKeyword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!keyword.trim()) return;
    void run(async () => {
      await standaloneClient.createSeoKeyword({ keyword: keyword.trim(), intent: 'high' });
      setKeyword('');
    });
  };

  const createTimeBlock = (event: React.FormEvent) => {
    event.preventDefault();
    if (!timeBlockTitle.trim()) return;
    void run(async () => {
      await standaloneClient.createTimeBlock({
        title: timeBlockTitle.trim(),
        startTime: timeBlockStart,
        endTime: timeBlockEnd,
        dayOfWeek: 1,
        type: 'strategic',
      });
      setTimeBlockTitle('');
    });
  };

  const startNextWeek = () => {
    const nextWeek = Math.min(12, (weekMarkers.reduce((max, marker) => Math.max(max, marker.weekNumber), 0) || 0) + 1);
    void run(async () => {
      await standaloneClient.createWeekMarker({ weekNumber: nextWeek, status: 'active' });
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader
        showNotifications={false}
        badge="Strategy"
        badgeIcon={<Lightbulb className="h-3.5 w-3.5" />}
        title="Strategy & signals"
        subtitle="Prompts, distribution, SEO, feedback, and weekly cadence stored in this workspace."
        actions={(
          <button onClick={() => void load()} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-950" aria-label="Refresh strategy">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      />
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Loading strategy records…</p> : (
            <>
              <section className="grid gap-4 lg:grid-cols-2">
                <form onSubmit={createPrompt} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <Heading icon={<Target className="h-4 w-4" />} title="Prompt library" count={prompts.length} />
                  <div className="mt-4 space-y-2"><input value={promptTitle} onChange={(event) => setPromptTitle(event.target.value)} placeholder="Prompt title" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /><textarea value={promptContent} onChange={(event) => setPromptContent(event.target.value)} placeholder="Reusable prompt content" rows={3} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /><button disabled={busy} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save prompt</button></div>
                  <RecordList items={prompts.map((item) => `${item.title} · ${item.version}`)} empty="No prompts yet." />
                </form>
                <form onSubmit={createSocialPost} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <Heading icon={<Send className="h-4 w-4" />} title="Social queue" count={socialPosts.length} />
                  <div className="mt-4 space-y-2"><textarea value={socialContent} onChange={(event) => setSocialContent(event.target.value)} placeholder="Draft a social post" rows={3} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /><button disabled={busy} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add draft</button></div>
                  <RecordList items={socialPosts.map((item) => `${item.platform} · ${item.status} · ${item.content}`)} empty="No social posts yet." />
                </form>
                <form onSubmit={createKeyword} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <Heading icon={<Target className="h-4 w-4" />} title="SEO keywords" count={keywords.length} />
                  <div className="mt-4 flex gap-2"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="relevant keyword" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm" /><button disabled={busy} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add</button></div>
                  <RecordList items={keywords.map((item) => `${item.keyword} · ${item.intent}`)} empty="No keywords yet." />
                </form>
                <form onSubmit={createFeedback} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <Heading icon={<MessageSquare className="h-4 w-4" />} title="Feedback inbox" count={feedback.length} />
                  <div className="mt-4 space-y-2"><textarea value={feedbackContent} onChange={(event) => setFeedbackContent(event.target.value)} placeholder="Capture customer feedback" rows={3} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" /><button disabled={busy} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Capture feedback</button></div>
                  <RecordList items={feedback.map((item) => `${item.source} · ${item.sentiment} · ${item.content}`)} empty="No feedback yet." />
                </form>
              </section>
              <section className="grid gap-4 lg:grid-cols-[1fr_1fr_280px]">
                <form onSubmit={createTimeBlock} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <Heading icon={<CalendarClock className="h-4 w-4" />} title="Time blocks" count={timeBlocks.length} />
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"><input value={timeBlockTitle} onChange={(event) => setTimeBlockTitle(event.target.value)} placeholder="Focus block" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" /><input type="time" value={timeBlockStart} onChange={(event) => setTimeBlockStart(event.target.value)} className="rounded-lg border border-zinc-200 px-2 py-2 text-sm" /><input type="time" value={timeBlockEnd} onChange={(event) => setTimeBlockEnd(event.target.value)} className="rounded-lg border border-zinc-200 px-2 py-2 text-sm" /><button disabled={busy} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add</button></div>
                  <RecordList items={timeBlocks.map((item) => `${item.title} · ${item.startTime}–${item.endTime}`)} empty="No time blocks yet." />
                </form>
                <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <Heading icon={<CalendarClock className="h-4 w-4" />} title="Cycle weeks" count={weekMarkers.length} />
                  <p className="mt-3 text-sm text-zinc-500">Week markers keep planning cadence portable across installations.</p>
                  <button disabled={busy || weekMarkers.length >= 12} onClick={startNextWeek} className="mt-4 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Start next week</button>
                  <RecordList items={weekMarkers.map((item) => `Week ${item.weekNumber} · ${item.status}`)} empty="No week markers yet." />
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Portability</p><p className="mt-3 text-sm leading-6 text-amber-950">These records use workspace-scoped PostgreSQL tables and the same API shapes as the legacy Firebase collections.</p></div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Heading({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-zinc-500">{icon}</span><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{title}</p></div><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">{count}</span></div>;
}

function RecordList({ items, empty }: { items: string[]; empty: string }) {
  return <div className="mt-4 max-h-44 space-y-2 overflow-y-auto border-t border-zinc-100 pt-3">{items.slice(0, 20).map((item, index) => <p key={`${item}-${index}`} className="truncate rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{item}</p>)}{items.length === 0 && <p className="text-sm text-zinc-500">{empty}</p>}</div>;
}
