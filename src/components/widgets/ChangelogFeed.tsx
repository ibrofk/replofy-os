import React, { useMemo } from 'react';
import { CheckCircle2, FileText, PencilRuler, Archive, User, Calendar, Activity } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';
import { isPublishedBlogArticle, normalizeBlogArticleStatus } from '../../utils/blogArticles';
import { useUser } from '../../contexts/UserContext';
import { UserProfile } from '../../types';

function formatTimestamp(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ChangelogEvent {
  id: string;
  type: 'task_completed' | 'task_created' | 'task_updated' | 'blog_published' | 'blog_validated' | 'goal_completed' | 'goal_created' | 'feedback_received' | 'context_ingested';
  title: string;
  subtitle: string;
  actor: string;
  timestamp: string;
  icon: React.ReactNode;
  tone: 'green' | 'blue' | 'amber' | 'purple' | 'rose';
}

export function ChangelogFeed() {
  const { tasks, blogArticles, cycleGoals, feedbacks, contextSources } = useGlobalState();
  const { userProfile } = useUser();
  const teamMembers = useGlobalState().teamMembers;

  const getActorName = (authorId: string | undefined): string => {
    if (!authorId) return 'System';
    if (userProfile?.id === authorId) return 'You';
    const member = teamMembers.find(m => m.id === authorId);
    return member ? (member.displayName || member.email.split('@')[0]) : 'Unknown';
  };

  const events: ChangelogEvent[] = useMemo(() => {
    const result: ChangelogEvent[] = [];

    tasks
      .filter(t => t.status === 'done' && t.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 5)
      .forEach(task => {
        result.push({
          id: `task-done-${task.id}`,
          type: 'task_completed',
          title: task.title,
          subtitle: `${task.effortPoints} pts completed`,
          actor: getActorName(task.assigneeId || task.authorId),
          timestamp: task.completedAt!,
          icon: <CheckCircle2 className="h-4 w-4" />,
          tone: 'green',
        });
      });

    tasks
      .filter(t => t.status !== 'icebox' && t.status !== 'done')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
      .forEach(task => {
        result.push({
          id: `task-new-${task.id}`,
          type: 'task_created',
          title: task.title,
          subtitle: `${task.effortPoints} pts · ${task.status}`,
          actor: getActorName(task.authorId),
          timestamp: task.createdAt,
          icon: <PencilRuler className="h-4 w-4" />,
          tone: 'blue',
        });
      });

    blogArticles
      .filter(a => isPublishedBlogArticle(a) && a.publishedAt)
      .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())
      .slice(0, 3)
      .forEach(article => {
        result.push({
          id: `blog-pub-${article.id}`,
          type: 'blog_published',
          title: article.title,
          subtitle: `Published article`,
          actor: getActorName(article.authorId),
          timestamp: article.publishedAt!,
          icon: <FileText className="h-4 w-4" />,
          tone: 'purple',
        });
      });

    blogArticles
      .filter(a => normalizeBlogArticleStatus(a.status) === 'review' && a.validatedAt)
      .sort((a, b) => new Date(b.validatedAt!).getTime() - new Date(a.validatedAt!).getTime())
      .slice(0, 2)
      .forEach(article => {
        result.push({
          id: `blog-val-${article.id}`,
          type: 'blog_validated',
          title: article.title,
          subtitle: `Validated`,
          actor: getActorName(article.authorId),
          timestamp: article.validatedAt!,
          icon: <CheckCircle2 className="h-4 w-4" />,
          tone: 'amber',
        });
      });

    cycleGoals
      .filter(g => g.status === 'completed')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2)
      .forEach(goal => {
        result.push({
          id: `goal-done-${goal.id}`,
          type: 'goal_completed',
          title: goal.title,
          subtitle: `Cycle goal completed`,
          actor: getActorName(goal.authorId),
          timestamp: goal.createdAt,
          icon: <CheckCircle2 className="h-4 w-4" />,
          tone: 'green',
        });
      });

    feedbacks
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2)
      .forEach(fb => {
        result.push({
          id: `fb-${fb.id}`,
          type: 'feedback_received',
          title: fb.source,
          subtitle: fb.content.length > 60 ? fb.content.slice(0, 60) + '...' : fb.content,
          actor: getActorName(fb.authorId),
          timestamp: fb.createdAt,
          icon: <User className="h-4 w-4" />,
          tone: fb.sentiment === 'positive' ? 'green' : fb.sentiment === 'negative' ? 'rose' : 'amber',
        });
      });

    contextSources
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 2)
      .forEach(source => {
        result.push({
          id: `ctx-${source.id}`,
          type: 'context_ingested',
          title: source.title,
          subtitle: `v${source.latestVersion} · ${source.latestFileName}`,
          actor: getActorName(source.authorId),
          timestamp: source.updatedAt,
          icon: <Archive className="h-4 w-4" />,
          tone: 'blue',
        });
      });

    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return result.slice(0, 15);
  }, [tasks, blogArticles, cycleGoals, feedbacks, contextSources, teamMembers, userProfile]);

  const groupedEvents = useMemo(() => {
    const groups: { date: string; events: ChangelogEvent[] }[] = [];
    let currentDate = '';

    events.forEach(event => {
      const date = new Date(event.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date, events: [event] });
      } else {
        groups[groups.length - 1].events.push(event);
      }
    });

    return groups;
  }, [events]);

  return (
    <div className="rounded-[2rem] border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col h-full min-h-[400px]">
      <div className="border-b border-zinc-100 px-5 py-4 shrink-0 bg-zinc-50/50">
        <div className="flex items-center justify-between gap-3">
          <div>
          </div>
          <Calendar className="h-5 w-5 text-zinc-400" />
        </div>
      </div>

      <div className="divide-y divide-zinc-200">
        {groupedEvents.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500 text-center">No activity yet. Work will appear here as the cycle progresses.</div>
        ) : (
          groupedEvents.map((group, groupIdx) => (
            <div key={groupIdx} className={groupIdx > 0 ? '' : ''}>
              <div className="px-5 py-2 bg-zinc-50/50">
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">{group.date}</span>
              </div>
              {group.events.map((event) => (
                <div key={event.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-zinc-50/50 transition-colors">
                  <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    event.tone === 'green' ? 'bg-emerald-50 text-emerald-600' :
                    event.tone === 'blue' ? 'bg-blue-50 text-blue-600' :
                    event.tone === 'amber' ? 'bg-amber-50 text-amber-600' :
                    event.tone === 'purple' ? 'bg-violet-50 text-violet-600' :
                    'bg-rose-50 text-rose-600'
                  }`}>
                    {event.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-950">{event.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{event.subtitle}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-[10px] font-bold text-zinc-400">{formatTimestamp(event.timestamp)}</span>
                        <span className="text-[10px] text-zinc-400">{event.actor}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
