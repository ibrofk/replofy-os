import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Hash, Loader2, MessageSquare, Plus, Send, UserRound } from 'lucide-react';
import { StudioHeader } from '../components/ui/StudioHeader';
import { useUser } from '../contexts/UserContext';
import { standaloneClient } from '../services/standaloneClient';
import type { TeamChatChannel, TeamChatMessage, TeamChatParticipant } from '../types';

export function StandaloneTeamChatPage() {
  const { userProfile } = useUser();
  const [channels, setChannels] = useState<TeamChatChannel[]>([]);
  const [participants, setParticipants] = useState<TeamChatParticipant[]>([]);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const assignedParticipants = useMemo(
    () => participants.filter((participant) => selectedChannel?.participantIds.includes(participant.id)),
    [participants, selectedChannel],
  );

  const loadDirectory = async () => {
    try {
      const [channelResult, participantResult] = await Promise.all([
        standaloneClient.listTeamChatChannels(),
        standaloneClient.listTeamChatParticipants(),
      ]);
      setChannels(channelResult.data);
      setParticipants(participantResult.data);
      setSelectedChannelId((current) => current || channelResult.data[0]?.id || '');
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Team Chat failed to load.');
    }
  };

  useEffect(() => {
    void loadDirectory();
  }, [userProfile?.companyId]);

  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]);
      return;
    }
    standaloneClient.listTeamChatMessages(selectedChannelId)
      .then((result) => setMessages([...result.data].reverse()))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Messages failed to load.'));
  }, [selectedChannelId]);

  useEffect(() => {
    if (!assignedParticipants.some((participant) => participant.id === selectedParticipantId)) {
      setSelectedParticipantId(assignedParticipants[0]?.id || '');
    }
  }, [assignedParticipants, selectedParticipantId]);

  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createTeamChatChannel({ name: channelName });
      setChannels((current) => [created, ...current]);
      setSelectedChannelId(created.id);
      setChannelName('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Channel creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const createParticipant = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createTeamChatParticipant({
        displayName: participantName,
        participantType: 'ai-agent',
      });
      setParticipants((current) => [created, ...current]);
      setParticipantName('');
      if (selectedChannel) {
        const updated = await standaloneClient.addTeamChatParticipant(selectedChannel.id, created.id);
        setChannels((current) => current.map((channel) => (
          channel.id === updated.data.id ? updated.data : channel
        )));
        setSelectedParticipantId(created.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Identity creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const addParticipant = async (participantId: string) => {
    if (!selectedChannel) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await standaloneClient.addTeamChatParticipant(selectedChannel.id, participantId);
      setChannels((current) => current.map((channel) => (
        channel.id === updated.data.id ? updated.data : channel
      )));
      setSelectedParticipantId(participantId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Identity assignment failed.');
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedChannelId || !selectedParticipantId || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await standaloneClient.createTeamChatMessage({
        channelId: selectedChannelId,
        participantId: selectedParticipantId,
        content: message,
      });
      setMessages((current) => [...current, created]);
      setMessage('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Message failed to send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader
        showNotifications={false}
        badge="PostgreSQL"
        badgeIcon={<MessageSquare className="h-3.5 w-3.5" />}
        title="Team Chat"
        subtitle="Workspace-isolated channels with named human and AI identities."
      />
      {error && <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid min-h-0 flex-1 gap-4 p-5 lg:grid-cols-[240px_1fr_260px]">
        <aside className="overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Channels</h2>
          <form onSubmit={createChannel} className="mt-3 flex gap-2">
            <input required value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="release-room" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm" />
            <button disabled={busy} className="rounded-lg bg-zinc-950 p-2 text-white" aria-label="Create channel"><Plus className="h-4 w-4" /></button>
          </form>
          <div className="mt-4 space-y-1">
            {channels.map((channel) => (
              <button key={channel.id} onClick={() => setSelectedChannelId(channel.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold ${channel.id === selectedChannelId ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
                <Hash className="h-4 w-4" /> <span className="truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="font-bold text-zinc-950">{selectedChannel ? `# ${selectedChannel.name}` : 'Create a channel to begin'}</h2>
            {selectedChannel?.topic && <p className="mt-1 text-sm text-zinc-500">{selectedChannel.topic}</p>}
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((item) => (
              <article key={item.id} className="flex gap-3">
                <div className="mt-0.5 rounded-full bg-zinc-100 p-2">{item.participantType === 'ai-agent' ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}</div>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{item.senderName} <span className="ml-2 text-xs font-normal text-zinc-400">{new Date(item.createdAt).toLocaleString()}</span></p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{item.content}</p>
                </div>
              </article>
            ))}
          </div>
          <form onSubmit={sendMessage} className="border-t border-zinc-100 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-500">Send as</span>
              <select value={selectedParticipantId} onChange={(event) => setSelectedParticipantId(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs">
                {assignedParticipants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <textarea required disabled={!selectedParticipantId} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={selectedParticipantId ? 'Write a message…' : 'Assign an identity first'} className="min-h-12 flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
              <button disabled={busy || !selectedParticipantId} className="self-end rounded-xl bg-zinc-950 p-3 text-white disabled:opacity-40" aria-label="Send message">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </section>

        <aside className="overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Identities</h2>
          <form onSubmit={createParticipant} className="mt-3 flex gap-2">
            <input required value={participantName} onChange={(event) => setParticipantName(event.target.value)} placeholder="Release Operator" className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm" />
            <button disabled={busy} className="rounded-lg bg-zinc-950 p-2 text-white" aria-label="Create AI identity"><Plus className="h-4 w-4" /></button>
          </form>
          <div className="mt-4 space-y-2">
            {participants.map((participant) => {
              const assigned = selectedChannel?.participantIds.includes(participant.id);
              return (
                <button key={participant.id} disabled={!selectedChannel || assigned || busy} onClick={() => void addParticipant(participant.id)} className="flex w-full items-center gap-2 rounded-xl border border-zinc-100 p-3 text-left disabled:cursor-default">
                  {participant.participantType === 'ai-agent' ? <Bot className="h-4 w-4 text-violet-500" /> : <UserRound className="h-4 w-4 text-blue-500" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{participant.displayName}</span>
                  <span className="text-[10px] uppercase text-zinc-400">{assigned ? 'added' : 'add'}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
