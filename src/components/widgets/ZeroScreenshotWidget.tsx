import React from 'react';
import { Zap, Download, FileJson, Code2 } from 'lucide-react';

export function ZeroScreenshotWidget() {
  return (
    <div className="bento-card col-span-1 md:col-span-1 lg:col-span-1 bg-gradient-to-br from-zinc-50 to-white border-zinc-100">
      <div className="bento-title">
        <Zap className="w-4 h-4 text-zinc-600" />
        AI Context Ops
      </div>
      
      <div className="flex flex-col h-full justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight mb-2 text-gray-900">Zero-Screenshot Engine</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Generates a structured "Global State" block from current UI config and active task list.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 hover:border-zinc-300 transition-all group shadow-sm">
            <FileJson className="w-6 h-6 text-gray-400 group-hover:text-zinc-600 mb-2 transition-colors" />
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.24em] text-center">Global State</span>
          </button>
          <button className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 hover:border-zinc-300 transition-all group shadow-sm">
            <Code2 className="w-6 h-6 text-gray-400 group-hover:text-zinc-600 mb-2 transition-colors" />
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.24em] text-center">Dev Sync</span>
          </button>
        </div>

        <button className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-zinc-950 hover:bg-zinc-800 text-white font-semibold rounded-2xl transition-colors shadow-sm">
          <Download className="w-4 h-4" />
          Export .md Context
        </button>
      </div>
    </div>
  );
}
