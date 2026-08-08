import React from 'react';
import { Eye, Target } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';

export function WeeklyIdentityVisionWidget() {
  const { visions } = useGlobalState();
  const vision = visions[0] ?? null;

  return (
    <div className="bento-card h-full w-full bg-gradient-to-br from-zinc-50 to-white border-zinc-100">
      <div className="bento-title">
        <Eye className="w-4 h-4 text-zinc-600" />
        Weekly Identity Vision (WIV)
      </div>
      
      <div className="flex flex-col h-full justify-between gap-4">
        {vision ? (
          <>
            <div>
              <h3 className="text-xl font-bold tracking-tight mb-2 text-zinc-600">"{vision.title}"</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {vision.description}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-mono text-gray-500 uppercase tracking-[0.24em] mb-3">
                <Target className="w-3 h-3 text-zinc-600" />
                Primary Focus
              </div>
              <ul className="space-y-2">
                {vision.focusItems?.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-zinc-500 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No active vision found. Create one in the Vision module.
          </div>
        )}
      </div>
    </div>
  );
}
