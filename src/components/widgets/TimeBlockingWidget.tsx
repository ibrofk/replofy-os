import React, { useMemo } from 'react';
import { Clock, Briefcase, MessageSquare, Coffee } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';

const TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  strategic: { icon: Briefcase, color: 'text-zinc-600', bg: 'bg-zinc-50' },
  buffer: { icon: MessageSquare, color: 'text-zinc-600', bg: 'bg-zinc-100' },
  breakout: { icon: Coffee, color: 'text-zinc-600', bg: 'bg-zinc-100' },
};

export function TimeBlockingWidget() {
  const { timeBlocks } = useGlobalState();

  const todayBlocks = useMemo(() => {
    const today = new Date().getDay();
    return timeBlocks
      .filter(block => block.dayOfWeek === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [timeBlocks]);

  const displayBlocks = todayBlocks.length > 0 ? todayBlocks : timeBlocks.slice(0, 5);

  return (
    <div className="bento-card h-full w-full">
      <div className="bento-title">
        <Clock className="w-4 h-4 text-zinc-600" />
        Time Blocking Suite
      </div>
      
      <div className="flex flex-col h-full justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight mb-4 text-gray-900">Today's Schedule</h3>
          {displayBlocks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No time blocks scheduled for today.</p>
          ) : (
            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              {displayBlocks.map((block) => {
                const config = TYPE_CONFIG[block.type] || TYPE_CONFIG.strategic;
                const Icon = config.icon;
                return (
                  <div key={block.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                      <Icon className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-2xl border border-gray-200 bg-gray-50 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-mono font-bold uppercase tracking-[0.24em] ${config.color}`}>{block.title}</span>
                      </div>
                      <div className="text-gray-500 text-xs">{block.startTime} - {block.endTime}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
