import React from 'react';
import { TrendingUp, MessageCircle, Share2, Search } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';

export function GrowthPulseWidget() {
  const { socialPosts, seoKeywords, feedbacks } = useGlobalState();

  const scheduledPosts = socialPosts.filter(p => p.status === 'scheduled').length;
  const highIntentKeywords = seoKeywords.filter(k => k.intent === 'high').length;

  const overallSentiment = feedbacks.length > 0
    ? (() => {
        const scores = feedbacks.map(f => f.sentiment === 'positive' ? 1 : f.sentiment === 'negative' ? -1 : 0);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return avg > 0.2 ? 'Positive' : avg < -0.2 ? 'Negative' : 'Neutral';
      })()
    : 'No data';

  return (
    <div className="bento-card col-span-1 md:col-span-2 lg:col-span-1">
      <div className="bento-title">
        <TrendingUp className="w-4 h-4 text-zinc-600" />
        Growth Pulse Sync
      </div>
      
      <div className="flex flex-col h-full justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight mb-4 text-gray-900">Marketing & Growth</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Social Scheduler</p>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.24em]">Auto-Changelog to Posts</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-zinc-600">+{scheduledPosts} Scheduled</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">SEO Focus Planner</p>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.24em]">High-Intent Keywords</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-zinc-600">{highIntentKeywords} Mapped</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Community Feedback</p>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.24em]">Sentiment Aggregation</p>
                </div>
              </div>
              <span className={`text-xs font-mono font-bold ${
                overallSentiment === 'Positive' ? 'text-zinc-600' :
                overallSentiment === 'Negative' ? 'text-zinc-600' :
                'text-gray-500'
              }`}>{overallSentiment}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
