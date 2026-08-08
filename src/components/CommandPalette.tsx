import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  Command,
  ArrowRight,
  CheckSquare,
  Bug,
  Target,
  Users,
  Calendar,
  FileText,
  FilePenLine,
  Newspaper,
  Settings2,
  Layers3,
  Zap,
  Globe,
  MessageSquare,
  Sparkles,
  KeyRound,
  Clock,
  BarChart3,
  ChevronRight,
  Hash,
  TrendingUp,
  Building2,
  Palette,
  FileImage,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import {
  Task,
  Bug as BugRecord,
  BlogArticle,
  Vision,
  CycleGoal,
  ApiEndpoint,
  SocialPost,
  SeoKeyword,
  Feedback,
  TimeBlock,
  ContextSource,
  Prompt,
  RoadmapItem,
  UserProfile,
  Account,
  Lead,
  CreativeItem,
  CreativeAsset,
} from '../types';
import { normalizeBlogArticleStatus } from '../utils/blogArticles';
import {
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
  ROADMAP_PHASE_LABELS,
  ROADMAP_PRIORITY_LABELS,
  ROADMAP_STATUS_LABELS,
} from '../utils/technicalStudio';
import { isAdminRole } from '../utils/userRoles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  path: string;
  score: number;
  icon: React.ReactNode;
  badge?: string;
}

type SearchResultType =
  | 'page'
  | 'task'
  | 'bug'
  | 'roadmap'
  | 'cycle'
  | 'vision'
  | 'blog'
  | 'context'
  | 'prompt'
  | 'api'
  | 'social'
  | 'seo'
  | 'feedback'
  | 'account'
  | 'lead'
  | 'timeblock'
  | 'environment'
  | 'teammember'
  | 'creative'
  | 'creativeasset';

interface SearchGroup {
  label: string;
  results: SearchResult[];
}

// ─── Search Configuration ─────────────────────────────────────────────────────

const PAGES = [
  { label: 'Home', path: '/', icon: <BarChart3 className="w-4 h-4" />, type: 'page' as const },
  { label: 'Tasks', path: '/tasks', icon: <CheckSquare className="w-4 h-4" />, type: 'page' as const },
  { label: 'Execution', path: '/execution', icon: <Zap className="w-4 h-4" />, type: 'page' as const },
  { label: 'Technical Studio', path: '/technical-studio', icon: <Bug className="w-4 h-4" />, type: 'page' as const },
  { label: 'Growth Pipeline', path: '/growth', icon: <TrendingUp className="w-4 h-4" />, type: 'page' as const },
  { label: 'Creative Hub', path: '/creative-hub', icon: <Palette className="w-4 h-4" />, type: 'page' as const },
  { label: 'Team', path: '/team', icon: <Users className="w-4 h-4" />, type: 'page' as const },
  { label: 'Week 13 Review', path: '/week-13', icon: <Calendar className="w-4 h-4" />, type: 'page' as const },
  { label: 'Docs', path: '/content', icon: <FileText className="w-4 h-4" />, type: 'page' as const },
  { label: 'Business Plan', path: '/business-plan', icon: <FilePenLine className="w-4 h-4" />, type: 'page' as const },
  { label: 'Blogs', path: '/blogs', icon: <Newspaper className="w-4 h-4" />, type: 'page' as const },
  { label: 'Systems', path: '/systems', icon: <Layers3 className="w-4 h-4" />, type: 'page' as const },
  { label: 'Settings', path: '/settings', icon: <Settings2 className="w-4 h-4" />, type: 'page' as const },
];

const TYPE_CONFIG: Record<SearchResultType, { icon: React.ReactNode; color: string; group: string }> = {
  page: { icon: <Globe className="w-4 h-4" />, color: 'text-blue-500', group: 'Pages' },
  task: { icon: <CheckSquare className="w-4 h-4" />, color: 'text-emerald-500', group: 'Tasks' },
  bug: { icon: <Bug className="w-4 h-4" />, color: 'text-rose-500', group: 'Technical Studio' },
  roadmap: { icon: <Sparkles className="w-4 h-4" />, color: 'text-violet-500', group: 'Technical Studio' },
  cycle: { icon: <Target className="w-4 h-4" />, color: 'text-violet-500', group: 'Cycle Goals' },
  vision: { icon: <Layers3 className="w-4 h-4" />, color: 'text-indigo-500', group: 'Visions' },
  blog: { icon: <Newspaper className="w-4 h-4" />, color: 'text-amber-500', group: 'Blog Articles' },
  context: { icon: <FileText className="w-4 h-4" />, color: 'text-cyan-500', group: 'Context Sources' },
  prompt: { icon: <KeyRound className="w-4 h-4" />, color: 'text-pink-500', group: 'Prompts' },
  api: { icon: <Globe className="w-4 h-4" />, color: 'text-orange-500', group: 'API Endpoints' },
  social: { icon: <MessageSquare className="w-4 h-4" />, color: 'text-sky-500', group: 'Social Posts' },
  seo: { icon: <Hash className="w-4 h-4" />, color: 'text-teal-500', group: 'SEO Keywords' },
  feedback: { icon: <MessageSquare className="w-4 h-4" />, color: 'text-rose-500', group: 'Feedback' },
  account: { icon: <Building2 className="w-4 h-4" />, color: 'text-zinc-700', group: 'Growth Pipeline' },
  lead: { icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-600', group: 'Growth Pipeline' },
  timeblock: { icon: <Clock className="w-4 h-4" />, color: 'text-purple-500', group: 'Time Blocks' },
  environment: { icon: <Zap className="w-4 h-4" />, color: 'text-lime-500', group: 'Environments' },
  teammember: { icon: <Users className="w-4 h-4" />, color: 'text-zinc-700', group: 'Team Members' },
  creative: { icon: <Palette className="w-4 h-4" />, color: 'text-fuchsia-600', group: 'Creative Hub' },
  creativeasset: { icon: <FileImage className="w-4 h-4" />, color: 'text-violet-600', group: 'Creative Assets' },
};

const STATUS_BADGES: Record<string, string> = {
  todo: 'Todo',
  'in-progress': 'In Progress',
  done: 'Done',
  icebox: 'Icebox',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
  draft: 'Draft',
  review: 'Review',
  scheduled: 'Scheduled',
  published: 'Published',
  idea: 'Idea',
  planned: 'Planned',
  researching: 'Researching',
  drafting: 'Drafting',
  brief: 'Brief',
  'in-review': 'In Review',
  'changes-requested': 'Changes Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  healthy: 'Healthy',
  deploying: 'Deploying',
  failed: 'Failed',
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  prospect: 'Prospect',
  customer: 'Customer',
  partner: 'Partner',
  inactive: 'Inactive',
  qualified: 'Qualified',
  contacted: 'Contacted',
  'demo-booked': 'Demo Booked',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
  inbound: 'Inbound',
  referral: 'Referral',
  'cold-outreach': 'Cold Outreach',
  waitlist: 'Waitlist',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  email: 'Email',
  other: 'Other',
  high: 'High Intent',
  medium: 'Medium Intent',
  low: 'Low Intent',
  strategic: 'Strategic',
  buffer: 'Buffer',
  breakout: 'Breakout',
};

// ─── Fuzzy Search ─────────────────────────────────────────────────────────────

function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  if (!text) return 0;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match gets highest score
  if (t === q) return 100;

  // Starts with query
  if (t.startsWith(q)) return 90;

  // Contains query
  if (t.includes(q)) return 80;

  // Fuzzy match - all query chars found in order
  let qi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  let score = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
      qi++;
    } else {
      consecutive = 0;
    }
  }

  // All chars matched
  if (qi === q.length) {
    score += maxConsecutive * 5; // Bonus for consecutive matches
    score -= (t.length - qi) * 0.5; // Penalty for longer text
    return Math.max(0, score);
  }

  return 0;
}

function scoreResult(query: string, result: Omit<SearchResult, 'score'>): number {
  let score = fuzzyScore(query, result.title);

  // Bonus for subtitle match
  if (result.subtitle) {
    const subtitleScore = fuzzyScore(query, result.subtitle);
    if (subtitleScore > 0) {
      score = Math.max(score, subtitleScore * 0.7);
    }
  }

  // Bonus for exact type match
  if (query.toLowerCase() === result.type) {
    score += 20;
  }

  return score;
}

// ─── Result Builders ──────────────────────────────────────────────────────────

function buildPageResults(query: string): SearchResult[] {
  return PAGES
    .filter((page) => fuzzyScore(query, page.label) > 0)
    .map((page) => ({
      id: page.path,
      type: page.type,
      title: page.label,
      path: page.path,
      score: 0,
      icon: page.icon,
    }));
}

function buildTaskResults(query: string, tasks: Task[]): SearchResult[] {
  return tasks
    .map((task) => ({
      id: `task-${task.id}`,
      type: 'task' as const,
      title: task.title,
      subtitle: task.cycleGoalId ? `Cycle Goal` : 'Icebox',
      path: `/tasks?highlightTaskId=${task.id}`,
      score: 0,
      icon: <CheckSquare className="w-4 h-4" />,
      badge: STATUS_BADGES[task.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildBugResults(query: string, bugs: BugRecord[]): SearchResult[] {
  return bugs
    .map((bug) => ({
      id: `bug-${bug.id}`,
      type: 'bug' as const,
      title: bug.title,
      subtitle: `${BUG_STATUS_LABELS[bug.status]} · ${bug.linkedTaskIds.length} linked tasks`,
      path: `/technical-studio?bugId=${bug.id}`,
      score: 0,
      icon: <Bug className="w-4 h-4" />,
      badge: BUG_SEVERITY_LABELS[bug.severity],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildRoadmapResults(query: string, roadmapItems: RoadmapItem[]): SearchResult[] {
  return roadmapItems
    .map((item) => ({
      id: `roadmap-${item.id}`,
      type: 'roadmap' as const,
      title: item.title,
      subtitle: `${ROADMAP_PHASE_LABELS[item.phase]} · ${ROADMAP_STATUS_LABELS[item.status]} · ${item.linkedTaskIds.length} linked tasks`,
      path: `/technical-studio?roadmapItemId=${item.id}`,
      score: 0,
      icon: <Sparkles className="w-4 h-4" />,
      badge: ROADMAP_PRIORITY_LABELS[item.priority],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildCycleResults(query: string, cycles: CycleGoal[]): SearchResult[] {
  return cycles
    .map((cycle) => ({
      id: `cycle-${cycle.id}`,
      type: 'cycle' as const,
      title: cycle.title,
      subtitle: cycle.description.slice(0, 60),
      path: `/execution?taskId=${cycle.id}`,
      score: 0,
      icon: <Target className="w-4 h-4" />,
      badge: STATUS_BADGES[cycle.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildVisionResults(query: string, visions: Vision[]): SearchResult[] {
  return visions
    .map((vision) => ({
      id: `vision-${vision.id}`,
      type: 'vision' as const,
      title: vision.title,
      subtitle: vision.description.slice(0, 60),
      path: `/execution?taskId=${vision.id}`,
      score: 0,
      icon: <Layers3 className="w-4 h-4" />,
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildBlogResults(query: string, blogs: BlogArticle[]): SearchResult[] {
  return blogs
    .map((blog) => ({
      id: `blog-${blog.id}`,
      type: 'blog' as const,
      title: blog.title,
      subtitle: blog.summary.slice(0, 60),
      path: `/blogs?articleId=${blog.id}`,
      score: 0,
      icon: <Newspaper className="w-4 h-4" />,
      badge: STATUS_BADGES[normalizeBlogArticleStatus(blog.status)],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildContextResults(query: string, sources: ContextSource[]): SearchResult[] {
  return sources
    .map((source) => ({
      id: `context-${source.id}`,
      type: 'context' as const,
      title: source.title,
      subtitle: source.latestSummary.slice(0, 60),
      path: `/content?sourceId=${source.id}`,
      score: 0,
      icon: <FileText className="w-4 h-4" />,
      badge: STATUS_BADGES[source.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildPromptResults(query: string, prompts: Prompt[]): SearchResult[] {
  return prompts
    .map((prompt) => ({
      id: `prompt-${prompt.id}`,
      type: 'prompt' as const,
      title: prompt.title,
      subtitle: `v${prompt.version}`,
      path: `/execution?taskId=${prompt.id}`,
      score: 0,
      icon: <KeyRound className="w-4 h-4" />,
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildApiResults(query: string, endpoints: ApiEndpoint[]): SearchResult[] {
  return endpoints
    .map((endpoint) => ({
      id: `api-${endpoint.id}`,
      type: 'api' as const,
      title: `${endpoint.method} ${endpoint.path}`,
      subtitle: endpoint.description,
      path: `/systems?highlightApiId=${endpoint.id}`,
      score: 0,
      icon: <Globe className="w-4 h-4" />,
      badge: STATUS_BADGES[endpoint.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildSocialResults(query: string, posts: SocialPost[]): SearchResult[] {
  return posts
    .map((post) => ({
      id: `social-${post.id}`,
      type: 'social' as const,
      title: post.content.slice(0, 50),
      subtitle: post.platform,
      path: `/content?sourceId=${post.id}`,
      score: 0,
      icon: <MessageSquare className="w-4 h-4" />,
      badge: STATUS_BADGES[post.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildSeoResults(query: string, keywords: SeoKeyword[]): SearchResult[] {
  return keywords
    .map((keyword) => ({
      id: `seo-${keyword.id}`,
      type: 'seo' as const,
      title: keyword.keyword,
      path: `/content?sourceId=${keyword.id}`,
      score: 0,
      icon: <Hash className="w-4 h-4" />,
      badge: STATUS_BADGES[keyword.intent],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildFeedbackResults(query: string, feedbacks: Feedback[]): SearchResult[] {
  return feedbacks
    .map((feedback) => ({
      id: `feedback-${feedback.id}`,
      type: 'feedback' as const,
      title: feedback.content.slice(0, 50),
      subtitle: feedback.source,
      path: `/content?sourceId=${feedback.id}`,
      score: 0,
      icon: <MessageSquare className="w-4 h-4" />,
      badge: STATUS_BADGES[feedback.sentiment],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildAccountResults(query: string, accounts: Account[]): SearchResult[] {
  return accounts
    .map((account) => ({
      id: `account-${account.id}`,
      type: 'account' as const,
      title: account.name,
      subtitle: [account.website, account.industry].filter(Boolean).join(' آ· ') || `${account.linkedLeadIds?.length || 0} linked leads`,
      path: `/growth?accountId=${account.id}`,
      score: 0,
      icon: <Building2 className="w-4 h-4" />,
      badge: STATUS_BADGES[account.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildLeadResults(query: string, leads: Lead[]): SearchResult[] {
  return leads
    .map((lead) => ({
      id: `lead-${lead.id}`,
      type: 'lead' as const,
      title: lead.name,
      subtitle: [lead.companyName, lead.email, lead.nextAction].filter(Boolean).join(' آ· '),
      path: `/growth?leadId=${lead.id}`,
      score: 0,
      icon: <TrendingUp className="w-4 h-4" />,
      badge: STATUS_BADGES[lead.stage],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildTimeBlockResults(query: string, blocks: TimeBlock[]): SearchResult[] {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return blocks
    .map((block) => ({
      id: `timeblock-${block.id}`,
      type: 'timeblock' as const,
      title: block.title,
      subtitle: `${days[block.dayOfWeek]} ${block.startTime} - ${block.endTime}`,
      path: `/execution?taskId=${block.id}`,
      score: 0,
      icon: <Clock className="w-4 h-4" />,
      badge: STATUS_BADGES[block.type],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildEnvironmentResults(query: string, envs: { name: string; status: string; version: string }[]): SearchResult[] {
  return envs
    .map((env) => ({
      id: `env-${env.name}`,
      type: 'environment' as const,
      title: `${env.name} Environment`,
      subtitle: `v${env.version}`,
      path: '/systems',
      score: 0,
      icon: <Zap className="w-4 h-4" />,
      badge: STATUS_BADGES[env.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildTeamMemberResults(query: string, members: UserProfile[]): SearchResult[] {
  return members
    .map((member) => ({
      id: `member-${member.id}`,
      type: 'teammember' as const,
      title: member.displayName || member.email,
      subtitle: member.email,
      path: `/team?highlightMemberId=${member.id}`,
      score: 0,
      icon: <Users className="w-4 h-4" />,
      badge: isAdminRole(member.role) ? 'Command' : 'Operator',
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildCreativeResults(query: string, creatives: CreativeItem[]): SearchResult[] {
  return creatives
    .map((creative) => ({
      id: `creative-${creative.id}`,
      type: 'creative' as const,
      title: creative.title,
      subtitle: `${creative.platform} / ${creative.format.replace(/-/g, ' ')}`,
      path: `/creative-hub?creativeId=${creative.id}`,
      score: 0,
      icon: <Palette className="w-4 h-4" />,
      badge: STATUS_BADGES[creative.status],
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

function buildCreativeAssetResults(query: string, assets: CreativeAsset[]): SearchResult[] {
  return assets
    .filter((asset) => asset.status !== 'archived')
    .map((asset) => ({
      id: `creative-asset-${asset.id}`,
      type: 'creativeasset' as const,
      title: asset.title,
      subtitle: asset.fileName,
      path: '/creative-hub?view=assets',
      score: 0,
      icon: <FileImage className="w-4 h-4" />,
      badge: asset.assetType,
    }))
    .filter((result) => {
      const score = scoreResult(query, result);
      result.score = score;
      return score > 0;
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const {
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
  } = useGlobalState();
  const { userProfile } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search results
  const searchResults = useMemo(() => {
    if (!query.trim()) {
      // Show recent/popular items when no query
      return [];
    }

    const q = query.trim();

    // Build results from all sources
    const results: SearchResult[] = [
      ...buildPageResults(q),
      ...buildTaskResults(q, tasks),
      ...buildBugResults(q, bugs),
      ...buildRoadmapResults(q, roadmapItems),
      ...buildCycleResults(q, cycleGoals),
      ...buildVisionResults(q, visions),
      ...buildBlogResults(q, blogArticles),
      ...buildContextResults(q, contextSources),
      ...buildPromptResults(q, prompts),
      ...buildApiResults(q, apiEndpoints),
      ...buildSocialResults(q, socialPosts),
      ...buildSeoResults(q, seoKeywords),
      ...buildFeedbackResults(q, feedbacks),
      ...buildAccountResults(q, accounts),
      ...buildLeadResults(q, leads),
      ...buildTimeBlockResults(q, timeBlocks),
      ...buildEnvironmentResults(q, environments),
      ...buildTeamMemberResults(q, teamMembers),
      ...buildCreativeResults(q, creativeItems),
      ...buildCreativeAssetResults(q, creativeAssets),
    ];

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }, [
    query,
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
  ]);

  // Group results by type
  const groupedResults = useMemo(() => {
    if (searchResults.length === 0) return [];

    const groups = new Map<string, SearchResult[]>();

    for (const result of searchResults) {
      const config = TYPE_CONFIG[result.type];
      const groupName = config.group;
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(result);
    }

    return Array.from(groups.entries()).map(([label, results]) => ({
      label,
      results,
    }));
  }, [searchResults]);

  // Flatten for keyboard navigation
  const flatResults = useMemo(() => {
    return groupedResults.flatMap((group) => group.results);
  }, [groupedResults]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          navigateTo(flatResults[selectedIndex].path);
        }
      }
    },
    [flatResults, selectedIndex, navigate]
  );

  const navigateTo = useCallback(
    (path: string) => {
      navigate(path);
      setIsOpen(false);
    },
    [navigate]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selected = resultsRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-900/50 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-200">
          <Search className="w-5 h-5 text-zinc-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tasks, cycles, docs, blogs, systems, prompts..."
            className="flex-1 bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400 text-base font-sans"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
              }}
              className="ml-2 text-zinc-400 hover:text-zinc-600"
            >
              ×
            </button>
          )}
          <div className="flex items-center gap-1 text-xs text-zinc-500 font-mono bg-zinc-100 px-2 py-1 rounded ml-3 shrink-0">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="p-2 max-h-[60vh] overflow-y-auto">
          {!isLoaded && !query ? (
            <div className="flex items-center justify-center py-12 text-zinc-400 text-sm">
              <div className="animate-pulse">Loading workspace data...</div>
            </div>
          ) : flatResults.length === 0 && query ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Search className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm">No results found for "{query}"</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : flatResults.length === 0 && !query ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Search className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm">Start typing to search your workspace</p>
              <div className="flex gap-4 mt-4 text-xs">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-500">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-500">↵</kbd>
                  Open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 text-zinc-500">esc</kbd>
                  Close
                </span>
              </div>
            </div>
          ) : (
            groupedResults.map((group, groupIndex) => (
              <div key={group.label} className={groupIndex > 0 ? 'mt-3' : ''}>
                <div className="px-2 py-1.5 text-xs font-mono text-zinc-500 uppercase tracking-[0.24em]">
                  {group.label}
                </div>
                {group.results.map((result, resultIndex) => {
                  const globalIndex = flatResults.findIndex((r) => r.id === result.id);
                  const isSelected = globalIndex === selectedIndex;
                  const config = TYPE_CONFIG[result.type];

                  return (
                    <button
                      key={result.id}
                      data-selected={isSelected}
                      onClick={() => navigateTo(result.path)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left group transition-colors ${
                        isSelected ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`${config.color} shrink-0`}>{result.icon}</div>
                        <div className="min-w-0">
                          <div className="text-zinc-700 group-hover:text-zinc-900 truncate text-sm font-medium">
                            {result.title}
                          </div>
                          {result.subtitle && (
                            <div className="text-zinc-400 text-xs truncate mt-0.5">{result.subtitle}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {result.badge && (
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                            {result.badge}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-white text-zinc-500">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-white text-zinc-500">↵</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-white text-zinc-500">esc</kbd>
              Close
            </span>
          </div>
          {searchResults.length > 0 && (
            <span className="font-mono">{searchResults.length} results</span>
          )}
        </div>
      </div>
    </div>
  );
}
