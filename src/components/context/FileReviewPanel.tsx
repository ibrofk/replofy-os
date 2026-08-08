import React, { useState } from 'react';
import {
  X, Plus, Trash2, Check, ChevronDown, ChevronUp,
  FileText, Target, Eye, BarChart3, MessageSquare, Video,
  AlertCircle, Edit3, Building2, TrendingUp, Palette
} from 'lucide-react';
import { IngestionPayload, IngestionItem, IngestionKind, IngestionItemAction } from '../../services/contextIngestionService';

const KIND_CONFIG: Record<IngestionKind, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  task: { label: 'Task', icon: FileText, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  vision: { label: 'Vision', icon: Eye, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  cycleGoal: { label: 'Cycle Goal', icon: Target, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  review: { label: 'Feedback', icon: MessageSquare, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  plannerItem: { label: 'Planner', icon: BarChart3, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  video: { label: 'Social Post', icon: Video, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  creative: { label: 'Creative', icon: Palette, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  lead: { label: 'Lead', icon: TrendingUp, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
  account: { label: 'Account', icon: Building2, color: 'text-zinc-600', bg: 'bg-zinc-50 border-zinc-200' },
};

const KIND_OPTIONS: IngestionKind[] = ['task', 'vision', 'cycleGoal', 'review', 'plannerItem', 'video', 'creative', 'lead', 'account'];

const TASK_STATUSES = ['todo', 'in-progress', 'done', 'icebox'] as const;
const GOAL_STATUSES = ['active', 'completed', 'archived'] as const;
const POST_STATUSES = ['draft', 'scheduled', 'published'] as const;
const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
const PLATFORMS = ['Twitter', 'LinkedIn', 'Loom'] as const;
const FEEDBACK_SOURCES = ['Discord', 'Twitter', 'Email'] as const;
const LEAD_STAGES = ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'] as const;
const LEAD_SOURCES = ['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'] as const;
const LEAD_PRIORITIES = ['low', 'medium', 'high'] as const;
const ACCOUNT_STATUSES = ['prospect', 'customer', 'partner', 'inactive'] as const;
const CREATIVE_STATUSES = ['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'] as const;
const CREATIVE_PLATFORMS = ['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other'] as const;
const CREATIVE_FORMATS = ['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other'] as const;
const EFFORT_OPTIONS = [1, 2, 3, 5, 8] as const;

interface FileReviewPanelProps {
  file: File;
  payload: IngestionPayload;
  onApprove: (payload: IngestionPayload) => void;
  onReject: () => void;
  isProcessing: boolean;
  actions?: IngestionItemAction[];
}

interface EditableItemProps {
  item: IngestionItem;
  index: number;
  onUpdate: (index: number, field: keyof IngestionItem, value: any) => void;
  onRemove: (index: number) => void;
}

function EditableItem({ item, index, onUpdate, onRemove }: EditableItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = KIND_CONFIG[item.kind];
  const Icon = config.icon;

  return (
    <div className={`rounded-2xl border ${config.bg} transition-all`}>
      <div className="flex items-center gap-3 p-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={item.title}
            onChange={e => onUpdate(index, 'title', e.target.value)}
            className="w-full text-sm font-semibold text-gray-900 bg-transparent border-none outline-none focus:ring-0 p-0"
            placeholder="Item title..."
          />
          <p className="text-xs text-gray-500 truncate">{item.summary || 'No summary'}</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <select
              value={item.kind}
              onChange={e => onUpdate(index, 'kind', e.target.value as IngestionKind)}
              className="appearance-none text-xs font-mono font-bold uppercase tracking-[0.24em] bg-white border border-gray-200 rounded-lg px-2 py-1 pr-6 cursor-pointer hover:bg-gray-50"
            >
              {KIND_OPTIONS.map(k => (
                <option key={k} value={k}>{KIND_CONFIG[k].label}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-md hover:bg-white/60 text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onRemove(index)}
            className="p-1.5 rounded-md hover:bg-zinc-50 text-gray-400 hover:text-zinc-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-200/50 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Summary</label>
            <textarea
              value={item.summary || ''}
              onChange={e => onUpdate(index, 'summary', e.target.value)}
              className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
              rows={2}
              placeholder="Brief summary..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={item.description || ''}
              onChange={e => onUpdate(index, 'description', e.target.value)}
              className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
              rows={3}
              placeholder="Detailed description..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Match Key</label>
            <input
              type="text"
              value={item.matchKey || ''}
              onChange={e => onUpdate(index, 'matchKey', e.target.value)}
              className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
              placeholder="Used for matching existing items..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Aliases (comma-separated)</label>
            <input
              type="text"
              value={(item.aliases || []).join(', ')}
              onChange={e => onUpdate(index, 'aliases', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
              placeholder="Alternate names..."
            />
          </div>

          {(item.kind === 'task') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={item.status || 'todo'}
                  onChange={e => onUpdate(index, 'status', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                >
                  {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Effort Points</label>
                <select
                  value={item.effortPoints || 3}
                  onChange={e => onUpdate(index, 'effortPoints', Number(e.target.value))}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                >
                  {EFFORT_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.isLeadIndicator || false}
                    onChange={e => onUpdate(index, 'isLeadIndicator', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-zinc-600 focus:ring-zinc-500"
                  />
                  <span className="text-sm text-gray-700">Lead Indicator</span>
                </label>
              </div>
            </div>
          )}

          {item.kind === 'vision' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Focus Items (one per line)</label>
              <textarea
                value={(item.focusItems || []).join('\n')}
                onChange={e => onUpdate(index, 'focusItems', e.target.value.split('\n').filter(Boolean))}
                className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                rows={3}
                placeholder="Focus area 1&#10;Focus area 2"
              />
            </div>
          )}

          {item.kind === 'cycleGoal' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={item.status || 'active'}
                onChange={e => onUpdate(index, 'status', e.target.value)}
                className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
              >
                {GOAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {item.kind === 'review' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sentiment</label>
                <select
                  value={item.sentiment || 'neutral'}
                  onChange={e => onUpdate(index, 'sentiment', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                >
                  {SENTIMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                <select
                  value={item.source || 'Email'}
                  onChange={e => onUpdate(index, 'source', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                >
                  {FEEDBACK_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {item.kind === 'video' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Platform</label>
                <select
                  value={item.platform || 'Loom'}
                  onChange={e => onUpdate(index, 'platform', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                >
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={item.status || 'draft'}
                  onChange={e => onUpdate(index, 'status', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                >
                  {POST_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Scheduled For</label>
                <input
                  type="datetime-local"
                  value={item.scheduledFor ? item.scheduledFor.slice(0, 16) : ''}
                  onChange={e => onUpdate(index, 'scheduledFor', e.target.value ? new Date(e.target.value).toISOString() : '')}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                />
              </div>
            </div>
          )}

          {item.kind === 'creative' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Platform</label>
                  <select
                    value={item.creativePlatform || 'Other'}
                    onChange={e => onUpdate(index, 'creativePlatform', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  >
                    {CREATIVE_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Format</label>
                  <select
                    value={item.format || 'other'}
                    onChange={e => onUpdate(index, 'format', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  >
                    {CREATIVE_FORMATS.map(format => <option key={format} value={format}>{format}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={CREATIVE_STATUSES.includes(item.status as any) ? item.status : 'idea'}
                    onChange={e => onUpdate(index, 'status', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  >
                    {CREATIVE_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Campaign</label>
                <input
                  type="text"
                  value={item.campaign || ''}
                  onChange={e => onUpdate(index, 'campaign', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  placeholder="Campaign or content series"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Hook</label>
                <textarea
                  value={item.hook || ''}
                  onChange={e => onUpdate(index, 'hook', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  rows={2}
                  placeholder="Opening angle..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Brief</label>
                <textarea
                  value={item.brief || ''}
                  onChange={e => onUpdate(index, 'brief', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  rows={3}
                  placeholder="Creative direction..."
                />
              </div>
            </div>
          )}

          {item.kind === 'lead' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={item.email || ''}
                    onChange={e => onUpdate(index, 'email', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                    placeholder="lead@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                  <input
                    type="text"
                    value={item.companyName || ''}
                    onChange={e => onUpdate(index, 'companyName', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                    placeholder="Company name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Stage</label>
                  <select
                    value={item.stage || item.status || 'new'}
                    onChange={e => onUpdate(index, 'stage', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  >
                    {LEAD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                  <select
                    value={LEAD_SOURCES.includes(item.source as any) ? item.source : 'inbound'}
                    onChange={e => onUpdate(index, 'source', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  >
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                  <select
                    value={item.priority || 'medium'}
                    onChange={e => onUpdate(index, 'priority', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  >
                    {LEAD_PRIORITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Next Action</label>
                <input
                  type="text"
                  value={item.nextAction || ''}
                  onChange={e => onUpdate(index, 'nextAction', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  placeholder="Follow up, book demo, send proposal..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea
                  value={item.notes || ''}
                  onChange={e => onUpdate(index, 'notes', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  rows={2}
                  placeholder="Sales context..."
                />
              </div>
            </div>
          )}

          {item.kind === 'account' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
                  <input
                    type="text"
                    value={item.website || ''}
                    onChange={e => onUpdate(index, 'website', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                    placeholder="https://company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={ACCOUNT_STATUSES.includes(item.status as any) ? item.status : 'prospect'}
                    onChange={e => onUpdate(index, 'status', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  >
                    {ACCOUNT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Industry</label>
                  <input
                    type="text"
                    value={item.industry || ''}
                    onChange={e => onUpdate(index, 'industry', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                    placeholder="SaaS, ecommerce..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Size</label>
                  <input
                    type="text"
                    value={item.size || ''}
                    onChange={e => onUpdate(index, 'size', e.target.value)}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                    placeholder="11-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea
                  value={item.notes || ''}
                  onChange={e => onUpdate(index, 'notes', e.target.value)}
                  className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  rows={2}
                  placeholder="Account context..."
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileReviewPanel({ file, payload, onApprove, onReject, isProcessing, actions }: FileReviewPanelProps) {
  const [editablePayload, setEditablePayload] = useState<IngestionPayload>(() => JSON.parse(JSON.stringify(payload)));
  const [sourceExpanded, setSourceExpanded] = useState(false);

  if (actions) {
    const created = actions.filter(a => a.action === 'created');
    const updated = actions.filter(a => a.action === 'updated');
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Processing Complete</h2>
              <p className="text-sm text-gray-500 mt-1">{file.name}</p>
            </div>
            <button
              onClick={onReject}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-zinc-600">{created.length}</p>
                <p className="text-sm text-zinc-700 font-medium">Created</p>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold text-zinc-600">{updated.length}</p>
                <p className="text-sm text-zinc-700 font-medium">Updated</p>
              </div>
            </div>
            <div className="space-y-2">
              {actions.map((action, i) => {
                const config = KIND_CONFIG[action.kind];
                const Icon = config.icon;
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                      <p className="text-xs text-gray-500">{config.label}</p>
                    </div>
                    <span className={`text-xs font-mono font-bold px-2 py-1 rounded-full ${
                      action.action === 'created'
                        ? 'bg-zinc-100 text-zinc-700'
                        : 'bg-zinc-100 text-zinc-700'
                    }`}>
                      {action.action === 'created' ? 'Created' : 'Updated'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
            <button
              onClick={onReject}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleItemUpdate = (index: number, field: keyof IngestionItem, value: any) => {
    setEditablePayload(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }));
  };

  const handleItemRemove = (index: number) => {
    setEditablePayload(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleAddItem = () => {
    setEditablePayload(prev => ({
      ...prev,
      items: [...prev.items, {
        kind: 'task',
        title: '',
        summary: '',
        status: 'todo',
        effortPoints: 3,
        isLeadIndicator: false,
      }]
    }));
  };

  const itemCounts = editablePayload.items.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Review Extracted Data</h2>
            <p className="text-sm text-gray-500 mt-1">{file.name} — {editablePayload.items.length} items extracted</p>
          </div>
          <button
            onClick={onReject}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
          {KIND_OPTIONS.filter(k => itemCounts[k]).map(kind => {
            const config = KIND_CONFIG[kind];
            const Icon = config.icon;
            return (
              <span key={kind} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${config.bg} ${config.color}`}>
                <Icon className="w-3 h-3" />
                {config.label}: {itemCounts[kind]}
              </span>
            );
          })}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Source metadata */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50">
            <button
              onClick={() => setSourceExpanded(!sourceExpanded)}
              className="flex items-center justify-between w-full p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-gray-500" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Source Metadata</h3>
                  <p className="text-xs text-gray-500">{editablePayload.source.title}</p>
                </div>
              </div>
              {sourceExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {sourceExpanded && (
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={editablePayload.source.title}
                    onChange={e => setEditablePayload(prev => ({ ...prev, source: { ...prev.source, title: e.target.value } }))}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Summary</label>
                  <textarea
                    value={editablePayload.source.summary}
                    onChange={e => setEditablePayload(prev => ({ ...prev, source: { ...prev.source, summary: e.target.value } }))}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Aliases (comma-separated)</label>
                  <input
                    type="text"
                    value={editablePayload.source.aliases.join(', ')}
                    onChange={e => setEditablePayload(prev => ({ ...prev, source: { ...prev.source, aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } }))}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Extracted Items</h3>
              <button
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>
            <div className="space-y-2">
              {editablePayload.items.map((item, index) => (
                <EditableItem
                  item={item}
                  index={index}
                  onUpdate={handleItemUpdate}
                  onRemove={handleItemRemove}
                />
              ))}
              {editablePayload.items.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items extracted. Add items manually or reject this file.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <div className="text-xs text-gray-500">
            {editablePayload.items.length === 0 ? (
              <span className="text-zinc-600">No extracted items. Process source only or add items manually.</span>
            ) : (
              <span>{editablePayload.items.length} item{editablePayload.items.length !== 1 ? 's' : ''} ready to process</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onReject}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Reject
            </button>
            <button
              onClick={() => onApprove(editablePayload)}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-zinc-600 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Approve & Process
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
