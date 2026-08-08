import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  CirclePlus,
  Hash,
  MessageSquareText,
  Pencil,
  Search,
  Send,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import { useCommunication } from '../contexts/CommunicationContext';
import { useUser } from '../contexts/UserContext';
import type {
  TeamChatChannel,
  TeamChatMessage,
  TeamChatParticipant,
  TeamChatParticipantType,
} from '../types';
import { StudioHeader } from '../components/ui/StudioHeader';

function snapshotRows<T>(snapshot: { docs: Array<{ id: string; data: () => unknown }> }) {
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as object) }) as T);
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function TeamChatPage() {
  const { userProfile } = useUser();
  const { unreadByChannel, totalUnreadMessages, markChannelRead } = useCommunication();
  const [searchParams, setSearchParams] = useSearchParams();
  const [channels, setChannels] = useState<TeamChatChannel[]>([]);
  const [participants, setParticipants] = useState<TeamChatParticipant[]>([]);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState(searchParams.get('channel') ?? '');
  const [channelName, setChannelName] = useState('');
  const [channelTopic, setChannelTopic] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [participantDescription, setParticipantDescription] = useState('');
  const [participantType, setParticipantType] = useState<TeamChatParticipantType>('ai-agent');
  const [linkedUserId, setLinkedUserId] = useState('');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [chatError, setChatError] = useState('');
  const [mobileView, setMobileView] = useState<'channels' | 'conversation' | 'details'>('channels');
  const [isMobileChannelFormOpen, setIsMobileChannelFormOpen] = useState(false);

  const uid = auth.currentUser?.uid || userProfile?.id || '';
  const companyId = userProfile?.companyId;
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) || null;
  const channelParticipantIds = new Set(selectedChannel?.participantIds || []);
  const activeChannelParticipants = participants.filter((participant) => channelParticipantIds.has(participant.id));
  const availableParticipants = participants.filter((participant) => !channelParticipantIds.has(participant.id));

  useEffect(() => {
    if (!uid) return;
    const scopedQuery = (collectionName: string) =>
      companyId
        ? query(collection(db, collectionName), where('companyId', '==', companyId))
        : query(collection(db, collectionName), where('authorId', '==', uid));

    const unsubscribeChannels = onSnapshot(scopedQuery('teamChatChannels'), (snapshot) => {
      const rows = snapshotRows<TeamChatChannel>(snapshot).sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
      setChannels(rows);
      setSelectedChannelId((current) => current || rows[0]?.id || '');
    });
    const unsubscribeParticipants = onSnapshot(scopedQuery('teamChatParticipants'), (snapshot) => {
      setParticipants(snapshotRows<TeamChatParticipant>(snapshot).sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ));
    });

    return () => {
      unsubscribeChannels();
      unsubscribeParticipants();
    };
  }, [companyId, uid]);

  useEffect(() => {
    const requestedChannelId = searchParams.get('channel');
    if (requestedChannelId && channels.some((channel) => channel.id === requestedChannelId)) {
      setSelectedChannelId(requestedChannelId);
    }
  }, [channels, searchParams]);

  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]);
      return;
    }

    const messagesQuery = companyId
      ? query(
          collection(db, 'teamChatMessages'),
          where('companyId', '==', companyId),
          where('channelId', '==', selectedChannelId),
        )
      : query(
          collection(db, 'teamChatMessages'),
          where('authorId', '==', uid),
          where('channelId', '==', selectedChannelId),
        );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        setChatError('');
        setMessages(snapshotRows<TeamChatMessage>(snapshot).sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        ));
      },
      (error) => {
        console.error('[TeamChat] Failed to load messages:', error);
        setChatError('Messages could not be loaded. Refresh the page and try again.');
      },
    );
  }, [companyId, selectedChannelId, uid]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (!selectedChannelId || !latestMessage) return;
    void markChannelRead(selectedChannelId, latestMessage.createdAt).catch((error) => {
      console.warn('Unable to update the Team Chat read marker.', error);
    });
  }, [markChannelRead, messages, selectedChannelId]);

  const filteredMessages = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter((message) =>
      `${message.senderName} ${message.content}`.toLowerCase().includes(needle),
    );
  }, [messages, search]);

  const currentUserParticipant = participants.find(
    (participant) => participant.participantType === 'team-member' && participant.linkedUserId === uid,
  );

  async function createChannel(event: React.FormEvent) {
    event.preventDefault();
    if (!uid || !channelName.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const result = await addDoc(collection(db, 'teamChatChannels'), {
        name: channelName.trim(),
        topic: channelTopic.trim(),
        status: 'active',
        participantIds: [],
        createdAt: now,
        updatedAt: now,
        authorId: uid,
        companyId: companyId ?? null,
      });
      setSelectedChannelId(result.id);
      setSearchParams({ channel: result.id });
      setChannelName('');
      setChannelTopic('');
      setIsMobileChannelFormOpen(false);
      setMobileView('conversation');
    } finally {
      setIsSaving(false);
    }
  }

  async function createParticipant(event: React.FormEvent) {
    event.preventDefault();
    if (!uid || !participantName.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'teamChatParticipants'), {
        displayName: participantName.trim(),
        participantType,
        linkedUserId: participantType === 'team-member' ? linkedUserId || uid : null,
        description: participantDescription.trim(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
        authorId: uid,
        companyId: companyId ?? null,
      });
      setParticipantName('');
      setParticipantDescription('');
      setLinkedUserId('');
    } finally {
      setIsSaving(false);
    }
  }

  async function renameParticipant(participant: TeamChatParticipant) {
    const displayName = window.prompt('Rename participant', participant.displayName)?.trim();
    if (!displayName || displayName === participant.displayName) return;
    await updateDoc(doc(db, 'teamChatParticipants', participant.id), {
      displayName,
      updatedAt: new Date().toISOString(),
    });
  }

  async function addParticipantToChannel(participantId: string) {
    if (!selectedChannel) return;
    await updateDoc(doc(db, 'teamChatChannels', selectedChannel.id), {
      participantIds: arrayUnion(participantId),
      updatedAt: new Date().toISOString(),
    });
  }

  async function ensureCurrentUserParticipant() {
    if (currentUserParticipant) return currentUserParticipant.id;
    if (!uid || !userProfile) throw new Error('A signed-in profile is required.');
    const now = new Date().toISOString();
    const result = await addDoc(collection(db, 'teamChatParticipants'), {
      displayName: userProfile.displayName || userProfile.email.split('@')[0] || 'Team member',
      participantType: 'team-member',
      linkedUserId: uid,
      description: 'Replofy OS team member',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      authorId: uid,
      companyId: companyId ?? null,
    });
    return result.id;
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedChannel || !draft.trim() || !uid || !userProfile) return;
    setIsSaving(true);
    try {
      setChatError('');
      const participantId = await ensureCurrentUserParticipant();
      if (!selectedChannel.participantIds.includes(participantId)) {
        await addParticipantToChannel(participantId);
      }
      await addDoc(collection(db, 'teamChatMessages'), {
        channelId: selectedChannel.id,
        participantId,
        participantType: 'team-member',
        senderName: currentUserParticipant?.displayName || userProfile.displayName || userProfile.email.split('@')[0],
        content: draft.trim(),
        replyToMessageId: null,
        createdAt: new Date().toISOString(),
        authorId: uid,
        companyId: companyId ?? null,
      });
      setDraft('');
    } catch (error) {
      console.error('[TeamChat] Failed to send message:', error);
      setChatError('Message could not be sent. Refresh the page and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-100/70 md:hidden">
        {mobileView === 'channels' && (
          <>
            <div className="shrink-0 border-b border-zinc-200 bg-white px-4 pb-3 pt-4">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <MessageSquareText className="h-3 w-3" />
                Team Chat
              </div>
              <h1 className="mt-3 text-[24px] font-black tracking-tight text-zinc-950">Human and AI collaboration</h1>
              <p className="mt-1 max-w-md text-[13px] leading-5 text-zinc-500">
                Create channels and keep workspace conversations available through MCP.
              </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-zinc-50">
              <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">Workspace</p>
                  <h2 className="mt-1 text-sm font-black text-zinc-950">Channels</h2>
                </div>
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-500">
                  {channels.length}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      setSelectedChannelId(channel.id);
                      setSearchParams({ channel: channel.id });
                      setMobileView('conversation');
                    }}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition active:bg-zinc-100"
                    aria-label={`Open ${channel.name} channel`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white">
                      <Hash className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-zinc-950">{channel.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-400">{channel.topic || 'Workspace channel'}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {(unreadByChannel[channel.id] ?? 0) > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">
                          {(unreadByChannel[channel.id] ?? 0) > 99 ? '99+' : unreadByChannel[channel.id]}
                        </span>
                      )}
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">
                        {channel.participantIds.length}
                      </span>
                      <ChevronRight className="h-4 w-4 text-zinc-300" />
                    </span>
                  </button>
                ))}
                {channels.length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center">
                    <Hash className="mx-auto h-5 w-5 text-zinc-300" />
                    <p className="mt-3 text-sm font-bold text-zinc-700">No channels yet</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">Create a focused room for an operational thread.</p>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setIsMobileChannelFormOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-xs font-bold uppercase tracking-[0.14em] text-white"
                  aria-label="Create a new channel"
                >
                  <CirclePlus className="h-4 w-4" />
                  New channel
                </button>
              </div>
            </div>
          </>
        )}

        {mobileView === 'conversation' && (
          <div className="flex min-h-0 flex-1 flex-col bg-zinc-50">
            <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2">
              <button
                type="button"
                onClick={() => setMobileView('channels')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition active:bg-zinc-100"
                aria-label="Back to channels"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <h1 className="truncate text-sm font-black text-zinc-950">{selectedChannel?.name || 'Select a channel'}</h1>
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-400">
                  {activeChannelParticipants.length} identities / {messages.length} messages
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileView('details')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition active:bg-zinc-100"
                aria-label="Open channel details"
              >
                <UsersRound className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="mx-auto max-w-3xl space-y-1">
                {chatError && (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
                    {chatError}
                  </div>
                )}
                {filteredMessages.map((message) => (
                  <article key={message.id} className="flex gap-2.5 rounded-xl px-1 py-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      message.participantType === 'ai-agent'
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-600'
                    }`}>
                      {message.participantType === 'ai-agent' ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                        <span className="text-[13px] font-black text-zinc-950">{message.senderName}</span>
                        <span className="rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                          {message.participantType === 'ai-agent' ? 'AI agent' : 'Team member'}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400">{formatMessageTime(message.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-zinc-700">{message.content}</p>
                    </div>
                  </article>
                ))}
                {selectedChannel && filteredMessages.length === 0 && (
                  <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
                    <MessageSquareText className="h-6 w-6 text-zinc-300" />
                    <p className="mt-3 text-sm font-bold text-zinc-700">No messages yet</p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-400">Start the conversation with your team or AI agents.</p>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={sendMessage} className="shrink-0 border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-zinc-50 p-2 transition focus-within:border-zinc-400 focus-within:bg-white">
                <textarea
                  aria-label="Team chat message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!selectedChannel}
                  rows={2}
                  className="max-h-22 min-h-11 w-full resize-none bg-transparent px-1 py-1 text-sm font-medium leading-5 text-zinc-900 outline-none placeholder:text-zinc-400"
                  placeholder={selectedChannel ? 'Ask the team or an AI identity...' : 'Select a channel first'}
                />
                <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-1 pt-2">
                  <span className="truncate text-[10px] font-medium text-zinc-400">Humans and MCP agents</span>
                  <button
                    disabled={isSaving || !selectedChannel || !draft.trim()}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-white disabled:opacity-40"
                    aria-label="Send message"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {mobileView === 'details' && (
          <div className="flex min-h-0 flex-1 flex-col bg-zinc-50">
            <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2">
              <button
                type="button"
                onClick={() => setMobileView('conversation')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition active:bg-zinc-100"
                aria-label="Back to conversation"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Coordination</p>
                <h1 className="truncate text-sm font-black text-zinc-950">{selectedChannel?.name || 'Channel details'}</h1>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <section className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Participants</p>
                    <p className="mt-1 text-sm font-black text-zinc-950">In this channel</p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">{activeChannelParticipants.length}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {activeChannelParticipants.map((participant) => (
                    <div key={participant.id} className="flex min-h-14 items-center gap-2.5 rounded-lg border border-zinc-200 px-2.5 py-2">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                        participant.participantType === 'ai-agent' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                      }`}>
                        {participant.participantType === 'ai-agent' ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-zinc-900">{participant.displayName}</p>
                        <p className="mt-0.5 truncate text-[10px] text-zinc-400">{participant.description || (participant.participantType === 'ai-agent' ? 'AI collaborator' : 'Team member')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void renameParticipant(participant)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition active:bg-zinc-100"
                        aria-label={`Rename ${participant.displayName}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {activeChannelParticipants.length === 0 && (
                    <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-5 text-center text-[11px] leading-4 text-zinc-400">
                      Add identities to make this channel available for collaboration.
                    </p>
                  )}
                </div>
              </section>

              {selectedChannel && availableParticipants.length > 0 && (
                <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Available identities</p>
                  <div className="mt-3 space-y-2">
                    {availableParticipants.map((participant) => (
                      <div key={participant.id} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {participant.participantType === 'ai-agent' ? <Bot className="h-3.5 w-3.5 shrink-0 text-zinc-500" /> : <UserRound className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                          <span className="truncate text-xs font-bold text-zinc-700">{participant.displayName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void addParticipantToChannel(participant.id)}
                          className="min-h-11 shrink-0 rounded-lg bg-zinc-100 px-3 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600"
                          aria-label={`Add ${participant.displayName} to channel`}
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <form onSubmit={createParticipant} className="mt-4 space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Register identity</p>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-500">Name a human teammate or MCP-connected agent.</p>
                </div>
                <select aria-label="Participant type" value={participantType} onChange={(event) => setParticipantType(event.target.value as TeamChatParticipantType)} className="field-input min-h-11 bg-white">
                  <option value="ai-agent">AI agent</option>
                  <option value="team-member">Team member</option>
                </select>
                <input aria-label="Participant display name" value={participantName} onChange={(event) => setParticipantName(event.target.value)} className="field-input min-h-11 bg-white" placeholder="Display name" />
                {participantType === 'team-member' && (
                  <input aria-label="Linked user id" value={linkedUserId} onChange={(event) => setLinkedUserId(event.target.value)} className="field-input min-h-11 bg-white" placeholder={`Linked user id (defaults to ${uid})`} />
                )}
                <input aria-label="Participant description" value={participantDescription} onChange={(event) => setParticipantDescription(event.target.value)} className="field-input min-h-11 bg-white" placeholder="Role or description" />
                <button disabled={isSaving || !participantName.trim()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white disabled:opacity-40">
                  <CirclePlus className="h-4 w-4" />
                  Add identity
                </button>
              </form>
            </div>
          </div>
        )}

        {isMobileChannelFormOpen && (
          <div className="fixed inset-0 z-30 flex items-end bg-zinc-950/30 px-3 pt-12 md:hidden" role="dialog" aria-modal="true" aria-label="Create new channel">
            <button type="button" className="absolute inset-0" onClick={() => setIsMobileChannelFormOpen(false)} aria-label="Close new channel form" />
            <form onSubmit={createChannel} className="relative z-10 w-full rounded-t-2xl border border-zinc-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">New channel</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">Create a focused room for an operational thread.</p>
                </div>
                <button type="button" onClick={() => setIsMobileChannelFormOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500" aria-label="Close new channel form">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                <input aria-label="Channel name" value={channelName} onChange={(event) => setChannelName(event.target.value)} className="field-input min-h-11 bg-white" placeholder="Channel name" />
                <input aria-label="Channel topic" value={channelTopic} onChange={(event) => setChannelTopic(event.target.value)} className="field-input min-h-11 bg-white" placeholder="Short topic (optional)" />
                <button disabled={isSaving || !channelName.trim()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white disabled:opacity-40">
                  <CirclePlus className="h-4 w-4" />
                  Create channel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="hidden h-full flex-col overflow-hidden bg-zinc-100/70 md:flex">
      <StudioHeader
        badge="Team Chat"
        badgeIcon={<MessageSquareText className="h-3 w-3" />}
        title="Human and AI collaboration"
        subtitle="Create channels, name agents, and keep workspace conversations available through MCP."
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[280px_minmax(0,1fr)_340px] lg:overflow-hidden">
        <aside className="flex min-h-[420px] flex-col border-r border-zinc-200 bg-white lg:min-h-0">
          <div className="border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Workspace</p>
                <h2 className="mt-1 text-sm font-black text-zinc-950">Channels</h2>
                <p className="mt-1 text-[10px] font-semibold text-zinc-400">
                  {totalUnreadMessages > 0 ? `${totalUnreadMessages} unseen` : 'All caught up'}
                </p>
              </div>
              <div className="flex h-8 min-w-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-bold text-zinc-500">
                {channels.length}
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => {
                  setSelectedChannelId(channel.id);
                  setSearchParams({ channel: channel.id });
                }}
                className={`group flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  channel.id === selectedChannelId
                    ? 'border-zinc-950 bg-zinc-950 text-white shadow-sm'
                    : 'border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <Hash className={`mt-0.5 h-4 w-4 shrink-0 ${channel.id === selectedChannelId ? 'text-zinc-300' : 'text-zinc-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{channel.name}</span>
                  <span className={`mt-0.5 block truncate text-[11px] leading-4 ${channel.id === selectedChannelId ? 'text-zinc-400' : 'text-zinc-400'}`}>
                    {channel.topic || 'Workspace channel'}
                  </span>
                </span>
                {(unreadByChannel[channel.id] ?? 0) > 0 && (
                  <span className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                    channel.id === selectedChannelId ? 'bg-white text-zinc-950' : 'bg-red-500 text-white'
                  }`}>
                    {(unreadByChannel[channel.id] ?? 0) > 99 ? '99+' : unreadByChannel[channel.id]}
                  </span>
                )}
              </button>
            ))}
            {channels.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center">
                <Hash className="mx-auto h-4 w-4 text-zinc-300" />
                <p className="mt-2 text-xs font-semibold text-zinc-400">No channels yet</p>
              </div>
            )}
          </div>
          <form onSubmit={createChannel} className="space-y-2 border-t border-zinc-200 bg-zinc-50/70 p-4">
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">New channel</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">Create a focused room for an operational thread.</p>
            </div>
            <input aria-label="Channel name" value={channelName} onChange={(event) => setChannelName(event.target.value)} className="field-input bg-white" placeholder="Channel name" />
            <input aria-label="Channel topic" value={channelTopic} onChange={(event) => setChannelTopic(event.target.value)} className="field-input bg-white" placeholder="Short topic (optional)" />
            <button disabled={isSaving || !channelName.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-zinc-800 disabled:opacity-40">
              <CirclePlus className="h-4 w-4" />
              Create channel
            </button>
          </form>
        </aside>

        <main className="flex min-h-[620px] min-w-0 flex-col bg-zinc-50 lg:min-h-0">
          <div className="border-b border-zinc-200 bg-white px-5 py-4 md:px-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-zinc-400" />
                  <h2 className="truncate text-lg font-black tracking-tight text-zinc-950">{selectedChannel?.name || 'Select a channel'}</h2>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[11px] text-zinc-500">
                  <span>{selectedChannel?.topic || 'Choose a workspace channel to begin collaborating.'}</span>
                  {selectedChannel && (
                    <>
                      <span className="hidden h-1 w-1 rounded-full bg-zinc-300 sm:block" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                        {activeChannelParticipants.length} identities · {messages.length} messages
                      </span>
                    </>
                  )}
                </div>
              </div>
              <label className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 md:w-56">
                <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <input aria-label="Search messages" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-medium text-zinc-900 outline-none placeholder:text-zinc-400" placeholder="Search conversation" />
              </label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
            <div className="mx-auto max-w-3xl space-y-1">
              {chatError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {chatError}
                </div>
              )}
              {filteredMessages.map((message) => (
                <article key={message.id} className="group flex gap-3 rounded-xl px-2 py-3 transition hover:bg-white">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    message.participantType === 'ai-agent'
                      ? 'border-zinc-300 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-600'
                  }`}>
                    {message.participantType === 'ai-agent' ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-black text-zinc-950">{message.senderName}</span>
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                        {message.participantType === 'ai-agent' ? 'AI agent' : 'Team member'}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">{formatMessageTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{message.content}</p>
                  </div>
                </article>
              ))}
              {selectedChannel && filteredMessages.length === 0 && (
                <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-6 text-center">
                  <MessageSquareText className="h-6 w-6 text-zinc-300" />
                  <p className="mt-3 text-sm font-bold text-zinc-700">{search ? 'No matching messages' : 'Start the conversation'}</p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-400">
                    {search ? 'Try another search term.' : 'Coordinate with the team or ask a named AI identity to contribute through MCP.'}
                  </p>
                </div>
              )}
              {!selectedChannel && (
                <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                  <Hash className="h-6 w-6 text-zinc-300" />
                  <p className="mt-3 text-sm font-bold text-zinc-700">Select or create a channel</p>
                  <p className="mt-1 text-xs text-zinc-400">Channels keep operational conversations focused and available to MCP clients.</p>
                </div>
              )}
            </div>
          </div>
          <form onSubmit={sendMessage} className="border-t border-zinc-200 bg-white px-4 py-4 md:px-6">
            <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50 p-2 shadow-sm transition focus-within:border-zinc-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-zinc-900/5">
              <textarea aria-label="Team chat message" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!selectedChannel} className="min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm font-medium leading-6 text-zinc-900 outline-none placeholder:text-zinc-400" placeholder={selectedChannel ? 'Ask the team or an AI identity...' : 'Create or select a channel first'} />
              <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-2 pt-2">
                <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Available to humans and MCP-connected agents
                </div>
                <button disabled={isSaving || !selectedChannel || !draft.trim()} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-zinc-800 disabled:opacity-40" aria-label="Send message">
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </div>
            </div>
          </form>
        </main>

        <aside className="flex min-h-[560px] flex-col border-l border-zinc-200 bg-white lg:min-h-0">
          <div className="border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Coordination</p>
                <h2 className="mt-1 text-sm font-black text-zinc-950">Participants</h2>
              </div>
              <UsersRound className="h-4 w-4 text-zinc-400" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">In this channel</p>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{activeChannelParticipants.length}</span>
              </div>
              <div className="space-y-2">
                {activeChannelParticipants.map((participant) => (
                  <div key={participant.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 gap-2.5">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                          participant.participantType === 'ai-agent' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                        }`}>
                          {participant.participantType === 'ai-agent' ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-zinc-900">{participant.displayName}</p>
                          <p className="mt-0.5 truncate text-[10px] text-zinc-400">{participant.description || (participant.participantType === 'ai-agent' ? 'AI collaborator' : 'Team member')}</p>
                        </div>
                      </div>
                      <button onClick={() => void renameParticipant(participant)} className="text-zinc-300 transition hover:text-zinc-900" aria-label={`Rename ${participant.displayName}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                      <Check className="h-3 w-3" />
                      {participant.participantType === 'ai-agent' ? 'AI agent' : 'Team member'}
                    </div>
                  </div>
                ))}
                {activeChannelParticipants.length === 0 && (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-5 text-center text-[11px] leading-4 text-zinc-400">
                    Add identities to make this channel available for collaboration.
                  </p>
                )}
              </div>
            </section>

            {selectedChannel && availableParticipants.length > 0 && (
              <section className="mt-6 border-t border-zinc-100 pt-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Available identities</p>
                <div className="space-y-2">
                  {availableParticipants.map((participant) => (
                    <div key={participant.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        {participant.participantType === 'ai-agent' ? <Bot className="h-3.5 w-3.5 shrink-0 text-zinc-500" /> : <UserRound className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                        <span className="truncate text-xs font-bold text-zinc-700">{participant.displayName}</span>
                      </div>
                      <button onClick={() => void addParticipantToChannel(participant.id)} className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600 transition hover:bg-zinc-900 hover:text-white">
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          <form onSubmit={createParticipant} className="space-y-2 border-t border-zinc-200 bg-zinc-50/70 p-4">
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Register identity</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">Name a human teammate or MCP-connected agent.</p>
            </div>
            <select aria-label="Participant type" value={participantType} onChange={(event) => setParticipantType(event.target.value as TeamChatParticipantType)} className="field-input bg-white">
              <option value="ai-agent">AI agent</option>
              <option value="team-member">Team member</option>
            </select>
            <input aria-label="Participant display name" value={participantName} onChange={(event) => setParticipantName(event.target.value)} className="field-input bg-white" placeholder="Display name" />
            {participantType === 'team-member' && (
              <input aria-label="Linked user id" value={linkedUserId} onChange={(event) => setLinkedUserId(event.target.value)} className="field-input bg-white" placeholder={`Linked user id (defaults to ${uid})`} />
            )}
            <input aria-label="Participant description" value={participantDescription} onChange={(event) => setParticipantDescription(event.target.value)} className="field-input bg-white" placeholder="Role or description" />
            <button disabled={isSaving || !participantName.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-zinc-800 disabled:opacity-40">
              <CirclePlus className="h-4 w-4" />
              Add identity
            </button>
          </form>
        </aside>
      </div>
      </div>
    </>
  );
}
