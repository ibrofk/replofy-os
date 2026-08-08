import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Unsubscribe,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ChatChannel,
  ChatMessage,
  ChatReadState,
  WorkspaceNotification,
} from '../types';
import { useGlobalState } from './GlobalStateContext';
import { logFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface CommunicationContextValue {
  channels: ChatChannel[];
  messages: ChatMessage[];
  unreadMessages: ChatMessage[];
  unreadByChannel: Record<string, number>;
  totalUnreadMessages: number;
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  isLoaded: boolean;
  markChannelRead: (channelId: string, readThroughAt?: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
}

interface CommunicationProviderProps {
  uid: string;
  companyId?: string;
  children: React.ReactNode;
}

const CommunicationContext = createContext<CommunicationContextValue | null>(null);

function toTime(value?: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortByCreatedAtAsc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
}

function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
}

function channelDocumentId(scopeId: string, name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'channel';
  return `${scopeId}-${slug}`;
}

export function CommunicationProvider({
  uid,
  companyId,
  children,
}: CommunicationProviderProps) {
  const {
    tasks,
    bugs,
    roadmapItems,
    feedbacks,
    leads,
  } = useGlobalState();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readStates, setReadStates] = useState<ChatReadState[]>([]);
  const [lastNotificationReadAt, setLastNotificationReadAt] = useState<string | null>(null);
  const [loadedParts, setLoadedParts] = useState({
    channels: false,
    messages: false,
    reads: false,
    notifications: false,
  });

  useEffect(() => {
    if (!uid) return;

    setChannels([]);
    setMessages([]);
    setReadStates([]);
    setLoadedParts({
      channels: false,
      messages: false,
      reads: false,
      notifications: false,
    });

    const scopeField = companyId ? 'companyId' : 'authorId';
    const scopeValue = companyId ?? uid;
    const unsubscribers: Unsubscribe[] = [];

    const subscribe = <T,>(
      collectionName: string,
      field: string,
      value: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      loadedKey: 'channels' | 'messages' | 'reads',
      sorter?: (items: T[]) => T[],
      mapper?: (id: string, data: Record<string, unknown>) => T,
    ) => {
      const scopedQuery = query(collection(db, collectionName), where(field, '==', value));
      const unsubscribe = onSnapshot(
        scopedQuery,
        (snapshot) => {
          const data = snapshot.docs.map((snapshotDoc) => {
            const snapshotData = snapshotDoc.data() as Record<string, unknown>;
            return mapper
              ? mapper(snapshotDoc.id, snapshotData)
              : ({ id: snapshotDoc.id, ...snapshotData } as T);
          });
          setter(sorter ? sorter(data) : data);
          setLoadedParts((current) => ({ ...current, [loadedKey]: true }));
        },
        (error) => {
          logFirestoreError(error, OperationType.GET, collectionName);
          setLoadedParts((current) => ({ ...current, [loadedKey]: true }));
        },
      );
      unsubscribers.push(unsubscribe);
    };

    subscribe<ChatChannel>(
      'teamChatChannels',
      scopeField,
      scopeValue,
      setChannels,
      'channels',
      (items) => [...items].sort((a, b) => a.name.localeCompare(b.name)),
      (id, data) => ({
        id,
        name: String(data.name ?? ''),
        description: String(data.topic ?? ''),
        createdAt: String(data.createdAt ?? ''),
        updatedAt: String(data.updatedAt ?? ''),
        authorId: String(data.authorId ?? ''),
        companyId: typeof data.companyId === 'string' ? data.companyId : null,
      }),
    );
    subscribe<ChatMessage>(
      'teamChatMessages',
      scopeField,
      scopeValue,
      setMessages,
      'messages',
      sortByCreatedAtAsc,
      (id, data) => ({
        id,
        channelId: String(data.channelId ?? ''),
        channelName: '',
        content: String(data.content ?? ''),
        authorId: String(data.authorId ?? ''),
        authorName: String(data.senderName ?? 'Team member'),
        createdAt: String(data.createdAt ?? ''),
        companyId: typeof data.companyId === 'string' ? data.companyId : null,
      }),
    );
    subscribe<ChatReadState>(
      'chatReadStates',
      'userId',
      uid,
      setReadStates,
      'reads',
    );

    const notificationRef = doc(db, 'notificationReadStates', uid);
    const unsubscribeNotifications = onSnapshot(
      notificationRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const value = snapshot.data().lastReadAt;
          setLastNotificationReadAt(typeof value === 'string' ? value : null);
        } else {
          const now = new Date().toISOString();
          setLastNotificationReadAt(now);
          void setDoc(notificationRef, {
            userId: uid,
            authorId: uid,
            lastReadAt: now,
          }).catch((error) => {
            logFirestoreError(error, OperationType.CREATE, `notificationReadStates/${uid}`);
          });
        }
        setLoadedParts((current) => ({ ...current, notifications: true }));
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, `notificationReadStates/${uid}`);
        setLoadedParts((current) => ({ ...current, notifications: true }));
      },
    );
    unsubscribers.push(unsubscribeNotifications);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [companyId, uid]);

  useEffect(() => {
    if (!loadedParts.channels || channels.length > 0 || !uid) return;

    const scopeId = companyId ?? uid;
    const defaultChannelRef = doc(db, 'teamChatChannels', channelDocumentId(scopeId, 'general'));

    const ensureDefaultChannel = async () => {
      try {
        const existing = await getDoc(defaultChannelRef);
        if (existing.exists()) return;

        const now = new Date().toISOString();
        await setDoc(defaultChannelRef, {
          name: 'general',
          topic: 'Company-wide updates, decisions, and daily coordination.',
          status: 'active',
          participantIds: [],
          createdAt: now,
          updatedAt: now,
          authorId: uid,
          companyId: companyId ?? null,
        });
      } catch (error) {
        logFirestoreError(error, OperationType.CREATE, 'teamChatChannels/general');
      }
    };

    void ensureDefaultChannel();
  }, [channels.length, companyId, loadedParts.channels, uid]);

  const readStateByChannel = useMemo(
    () => new Map(readStates.map((state) => [state.channelId, state])),
    [readStates],
  );

  const unreadByChannel = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};

    for (const channel of channels) {
      const lastReadAt = toTime(readStateByChannel.get(channel.id)?.lastReadAt);
      counts[channel.id] = messages.filter(
        (message) => (
          message.channelId === channel.id
          && message.authorId !== uid
          && toTime(message.createdAt) > lastReadAt
        ),
      ).length;
    }

    return counts;
  }, [channels, messages, readStateByChannel, uid]);

  const unreadMessages = useMemo(
    () => sortByCreatedAtDesc(messages.filter((message) => {
      if (message.authorId === uid) return false;
      const lastReadAt = toTime(readStateByChannel.get(message.channelId)?.lastReadAt);
      return toTime(message.createdAt) > lastReadAt;
    })),
    [messages, readStateByChannel, uid],
  );

  const totalUnreadMessages = useMemo(
    () => Object.values(unreadByChannel).reduce<number>(
      (total, count) => total + Number(count),
      0,
    ),
    [unreadByChannel],
  );

  const notifications = useMemo(() => {
    const notificationReadTime = toTime(lastNotificationReadAt);
    const channelNameById = new Map(channels.map((channel) => [channel.id, channel.name]));
    const items: WorkspaceNotification[] = [];

    for (const message of messages) {
      if (message.authorId === uid) continue;
      const channelName = channelNameById.get(message.channelId) ?? message.channelName ?? 'chat';
      items.push({
        id: `message-${message.id}`,
        type: 'message',
        title: `${message.authorName} in #${channelName}`,
        body: message.content,
        createdAt: message.createdAt,
        href: `/team-chat?channel=${encodeURIComponent(message.channelId)}`,
        isUnread: toTime(message.createdAt) > notificationReadTime,
      });
    }

    for (const task of tasks) {
      if (task.assigneeId !== uid || task.authorId === uid) continue;
      items.push({
        id: `task-${task.id}`,
        type: 'task',
        title: 'Task assigned to you',
        body: task.title,
        createdAt: task.createdAt,
        href: '/tasks',
        isUnread: toTime(task.createdAt) > notificationReadTime,
      });
    }

    for (const bug of bugs) {
      if (bug.severity !== 'critical' && bug.severity !== 'high') continue;
      items.push({
        id: `bug-${bug.id}`,
        type: 'bug',
        title: `${bug.severity === 'critical' ? 'Critical' : 'High priority'} bug`,
        body: bug.title,
        createdAt: bug.updatedAt || bug.createdAt,
        href: '/technical-studio',
        isUnread: toTime(bug.updatedAt || bug.createdAt) > notificationReadTime,
      });
    }

    for (const item of roadmapItems) {
      if (item.status !== 'blocked') continue;
      items.push({
        id: `roadmap-${item.id}`,
        type: 'roadmap',
        title: 'Roadmap item blocked',
        body: item.title,
        createdAt: item.updatedAt || item.createdAt,
        href: '/technical-studio',
        isUnread: toTime(item.updatedAt || item.createdAt) > notificationReadTime,
      });
    }

    for (const feedback of feedbacks) {
      if (feedback.sentiment !== 'negative') continue;
      items.push({
        id: `feedback-${feedback.id}`,
        type: 'feedback',
        title: `Negative feedback from ${feedback.source}`,
        body: feedback.content,
        createdAt: feedback.createdAt,
        href: '/',
        isUnread: toTime(feedback.createdAt) > notificationReadTime,
      });
    }

    for (const lead of leads) {
      if (lead.ownerId !== uid || !lead.nextActionAt) continue;
      if (lead.stage === 'won' || lead.stage === 'lost') continue;
      if (toTime(lead.nextActionAt) > Date.now()) continue;
      items.push({
        id: `lead-${lead.id}`,
        type: 'lead',
        title: 'Lead follow-up due',
        body: `${lead.name}: ${lead.nextAction || 'Follow up'}`,
        createdAt: lead.nextActionAt,
        href: '/growth',
        isUnread: toTime(lead.nextActionAt) > notificationReadTime,
      });
    }

    return sortByCreatedAtDesc(items).slice(0, 40);
  }, [
    bugs,
    channels,
    feedbacks,
    lastNotificationReadAt,
    leads,
    messages,
    roadmapItems,
    tasks,
    uid,
  ]);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => notification.isUnread).length,
    [notifications],
  );

  const markChannelRead = useCallback(async (channelId: string, readThroughAt?: string) => {
    const latestMessage = [...messages]
      .reverse()
      .find((message) => message.channelId === channelId);
    const lastReadAt = readThroughAt ?? latestMessage?.createdAt ?? new Date().toISOString();
    const stateId = `${uid}__${channelId}`;

    await setDoc(doc(db, 'chatReadStates', stateId), {
      channelId,
      userId: uid,
      authorId: uid,
      lastReadAt,
      companyId: companyId ?? null,
    }, { merge: true });
  }, [companyId, messages, uid]);

  const markNotificationsRead = useCallback(async () => {
    const now = new Date().toISOString();
    setLastNotificationReadAt(now);
    await setDoc(doc(db, 'notificationReadStates', uid), {
      userId: uid,
      authorId: uid,
      lastReadAt: now,
    }, { merge: true });
  }, [uid]);

  const value = useMemo<CommunicationContextValue>(() => ({
    channels,
    messages,
    unreadMessages,
    unreadByChannel,
    totalUnreadMessages,
    notifications,
    unreadNotificationCount,
    isLoaded: Object.values(loadedParts).every(Boolean),
    markChannelRead,
    markNotificationsRead,
  }), [
    channels,
    loadedParts,
    markChannelRead,
    markNotificationsRead,
    messages,
    notifications,
    totalUnreadMessages,
    unreadByChannel,
    unreadMessages,
    unreadNotificationCount,
  ]);

  return (
    <CommunicationContext.Provider value={value}>
      {children}
    </CommunicationContext.Provider>
  );
}

export function useCommunication() {
  const context = useContext(CommunicationContext);
  if (!context) {
    throw new Error('useCommunication must be used inside <CommunicationProvider>.');
  }
  return context;
}
