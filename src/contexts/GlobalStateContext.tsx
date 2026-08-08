import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  standaloneClient,
  subscribeToStandaloneEvents,
  type StandaloneWorkspaceEvent,
} from '../services/standaloneClient';
import {
  Task,
  Bug,
  RoadmapItem,
  BlogArticle,
  Vision,
  CycleGoal,
  ApiEndpoint,
  EnvironmentState,
  Prompt,
  SocialPost,
  SeoKeyword,
  Feedback,
  Account,
  Lead,
  TimeBlock,
  ContextSource,
  UserProfile,
  CreativeItem,
  CreativeAsset,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalState {
  tasks: Task[];
  bugs: Bug[];
  roadmapItems: RoadmapItem[];
  blogArticles: BlogArticle[];
  visions: Vision[];
  cycleGoals: CycleGoal[];
  apiEndpoints: ApiEndpoint[];
  environments: EnvironmentState[];
  prompts: Prompt[];
  socialPosts: SocialPost[];
  seoKeywords: SeoKeyword[];
  feedbacks: Feedback[];
  accounts: Account[];
  leads: Lead[];
  timeBlocks: TimeBlock[];
  contextSources: ContextSource[];
  teamMembers: UserProfile[];
  creativeItems: CreativeItem[];
  creativeAssets: CreativeAsset[];
  isLoaded: boolean;
}

interface GlobalStateContextValue extends GlobalState {}

// ─── Context ──────────────────────────────────────────────────────────────────

const GlobalStateContext = createContext<GlobalStateContextValue | null>(null);

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Builds the correct Firestore query for a collection, scoped to either the
 * company (if the user belongs to one) or the individual user.
 */
// ─── Provider ─────────────────────────────────────────────────────────────────

interface GlobalStateProviderProps {
  companyId?: string;
  uid: string;
  children: React.ReactNode;
}

export function GlobalStateProvider({ companyId, uid, children }: GlobalStateProviderProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [blogArticles, setBlogArticles] = useState<BlogArticle[]>([]);
  const [visions, setVisions] = useState<Vision[]>([]);
  const [cycleGoals, setCycleGoals] = useState<CycleGoal[]>([]);
  const [apiEndpoints, setApiEndpoints] = useState<ApiEndpoint[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentState[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [seoKeywords, setSeoKeywords] = useState<SeoKeyword[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [contextSources, setContextSources] = useState<ContextSource[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [creativeItems, setCreativeItems] = useState<CreativeItem[]>([]);
  const [creativeAssets, setCreativeAssets] = useState<CreativeAsset[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!uid) return;

    if (import.meta.env.VITE_REPLOFY_PLATFORM === 'standalone') {
      let disposed = false;
      const replaceOrPrepend = <T extends { id: string }>(items: T[], item: T) => {
        const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
        if (existingIndex < 0) return [item, ...items];
        const next = [...items];
        next[existingIndex] = item;
        return next;
      };
      const applyEvent = (event: StandaloneWorkspaceEvent) => {
        if (event.resource === 'tasks') {
          setTasks((items) => event.type === 'deleted'
            ? items.filter((item) => item.id !== event.resourceId)
            : replaceOrPrepend(items, event.data as Task));
        } else if (event.resource === 'cycle-goals') {
          setCycleGoals((items) => event.type === 'deleted'
            ? items.filter((item) => item.id !== event.resourceId)
            : replaceOrPrepend(items, event.data as CycleGoal));
        } else if (event.resource === 'visions') {
          setVisions((items) => event.type === 'deleted'
            ? items.filter((item) => item.id !== event.resourceId)
            : replaceOrPrepend(items, event.data as Vision));
        }
      };
      const unsubscribe = subscribeToStandaloneEvents(applyEvent);

      Promise.all([
        standaloneClient.listTasks(),
        standaloneClient.listCycleGoals(),
        standaloneClient.listVisions(),
        standaloneClient.listMembers(),
        standaloneClient.listBugs(),
        standaloneClient.listRoadmapItems(),
        standaloneClient.listBlogArticles(),
        standaloneClient.listApiEndpoints(),
        standaloneClient.listEnvironments(),
        standaloneClient.listPrompts(),
        standaloneClient.listSocialPosts(),
        standaloneClient.listSeoKeywords(),
        standaloneClient.listFeedback(),
        standaloneClient.listAccounts(),
        standaloneClient.listLeads(),
        standaloneClient.listTimeBlocks(),
        standaloneClient.listContextSources(),
        standaloneClient.listCreativeItems(),
        standaloneClient.listCreativeAssets(),
      ]).then(([taskResult, goalResult, visionResult, memberResult, bugResult, roadmapResult, blogResult, endpointResult, environmentResult, promptResult, socialResult, keywordResult, feedbackResult, accountResult, leadResult, timeBlockResult, contextSourceResult, creativeItemResult, creativeAssetResult]) => {
        if (disposed) return;
        setTasks(taskResult.data);
        setCycleGoals(goalResult.data);
        setVisions(visionResult.data);
        setBugs(bugResult.data);
        setRoadmapItems(roadmapResult.data);
        setBlogArticles(blogResult.data);
        setApiEndpoints(endpointResult.data);
        setEnvironments(environmentResult.data);
        setPrompts(promptResult.data);
        setSocialPosts(socialResult.data);
        setSeoKeywords(keywordResult.data);
        setFeedbacks(feedbackResult.data);
        setAccounts(accountResult.data);
        setLeads(leadResult.data);
        setTimeBlocks(timeBlockResult.data);
        setContextSources(contextSourceResult.data);
        setCreativeItems(creativeItemResult.data);
        setCreativeAssets(creativeAssetResult.data);
        setTeamMembers(memberResult.data.map((member) => ({
          ...member,
          role: member.role === 'owner' ? 'master-admin' as const : member.role,
        })));
        setIsLoaded(true);
      }).catch((error) => {
        if (disposed) return;
        console.error('[GlobalState] Failed to load standalone execution data:', error);
        setIsLoaded(true);
      });

      return () => {
        disposed = true;
        unsubscribe();
        setIsLoaded(false);
      };
    }

    let disposed = false;
    const unsubscribers: Array<() => void> = [];

    void (async () => {
      const { subscribeToFirebaseCollection } = await import('../services/firebaseGlobalStateBridge');
      if (disposed) return;

    // Track how many collections have received their first snapshot
    let loadedCount = 0;
    const TOTAL_COLLECTIONS = companyId ? 19 : 18;
    const markLoaded = () => {
      loadedCount++;
      if (loadedCount >= TOTAL_COLLECTIONS) {
        setIsLoaded(true);
      }
    };

    const subscribe = <T,>(
      collectionName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sorter?: (a: T, b: T) => number
    ) => {
      const unsub = subscribeToFirebaseCollection({
        collectionName,
        companyId,
        uid,
        sorter,
        onData: setter,
        onSettled: markLoaded,
      });
      unsubscribers.push(unsub);
    };

    const byCreatedAtDesc = (a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const byUpdatedAtDesc = (a: any, b: any) =>
      new Date((b.updatedAt || b.createdAt)).getTime() - new Date((a.updatedAt || a.createdAt)).getTime();

    subscribe<Task>('tasks', setTasks, byCreatedAtDesc);
    subscribe<Bug>('bugs', setBugs, byUpdatedAtDesc);
    subscribe<RoadmapItem>('roadmapItems', setRoadmapItems, byUpdatedAtDesc);
    subscribe<BlogArticle>('blogArticles', setBlogArticles, byUpdatedAtDesc);
    subscribe<Vision>('visions', setVisions, byCreatedAtDesc);
    subscribe<CycleGoal>('cycleGoals', setCycleGoals, byCreatedAtDesc);
    subscribe<ApiEndpoint>('apiEndpoints', setApiEndpoints, byCreatedAtDesc);
    subscribe<EnvironmentState>('environments', setEnvironments);
    subscribe<Prompt>('prompts', setPrompts, byCreatedAtDesc);
    subscribe<SocialPost>('socialPosts', setSocialPosts, (a, b) =>
      new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime()
    );
    subscribe<SeoKeyword>('seoKeywords', setSeoKeywords, byCreatedAtDesc);
    subscribe<Feedback>('feedbacks', setFeedbacks, byCreatedAtDesc);
    subscribe<Account>('accounts', setAccounts, byUpdatedAtDesc);
    subscribe<Lead>('leads', setLeads, byUpdatedAtDesc);
    subscribe<TimeBlock>('timeBlocks', setTimeBlocks, (a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
    subscribe<ContextSource>('contextSources', setContextSources, byUpdatedAtDesc);
    subscribe<CreativeItem>('creativeItems', setCreativeItems, byUpdatedAtDesc);
    subscribe<CreativeAsset>('creativeAssets', setCreativeAssets, byUpdatedAtDesc);
    if (companyId) {
      subscribe<UserProfile>('users', setTeamMembers, byCreatedAtDesc);
    }
    })().catch((error) => {
      if (!disposed) {
        console.error('[GlobalState] Failed to initialize Firebase subscriptions:', error);
        setIsLoaded(true);
      }
    });

    return () => {
      disposed = true;
      unsubscribers.forEach((unsub) => {
        try { unsub(); } catch (e) {
          console.warn('[GlobalState] Error during cleanup:', e);
        }
      });
      setIsLoaded(false);
    };
  }, [companyId, uid]);

  const value: GlobalStateContextValue = {
    tasks,
    bugs,
    roadmapItems,
    blogArticles,
    visions,
    cycleGoals,
    apiEndpoints,
    environments,
    prompts,
    socialPosts,
    seoKeywords,
    feedbacks,
    accounts,
    leads,
    timeBlocks,
    contextSources,
    teamMembers,
    creativeItems,
    creativeAssets,
    isLoaded,
  };

  return (
    <GlobalStateContext.Provider value={value}>
      {children}
    </GlobalStateContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGlobalState(): GlobalStateContextValue {
  const ctx = useContext(GlobalStateContext);
  if (!ctx) {
    throw new Error('useGlobalState must be used inside <GlobalStateProvider>');
  }
  return ctx;
}
