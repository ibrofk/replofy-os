import React from 'react';
import { CheckCircle, RefreshCw, AlertCircle, Server } from 'lucide-react';
import { useGlobalState } from '../../contexts/GlobalStateContext';

function formatLastSync(isoString?: string): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function EnvironmentStatesWidget() {
  const { environments } = useGlobalState();

  return (
    <div className="space-y-3 p-5 shadow-inner bg-zinc-50/50 rounded-b-2xl h-full pb-6">
      {environments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
           <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-zinc-100 mb-3 shadow-sm">
             <Server className="w-4 h-4 text-zinc-300" />
           </div>
           <p className="text-xs font-medium text-zinc-500">No environments configured.</p>
        </div>
      ) : (
        environments.map((env) => (
          <div key={env.id} className="group flex items-center justify-between p-3.5 rounded-xl bg-white border border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all duration-200">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-inner ${
                env.status === 'healthy' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                env.status === 'deploying' ? 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse' :
                'bg-red-50 text-red-600 border border-red-100'
              }`}>
                {env.status === 'healthy' && <CheckCircle className="w-4 h-4" />}
                {env.status === 'deploying' && <RefreshCw className="w-4 h-4 animate-spin" />}
                {env.status === 'failed' && <AlertCircle className="w-4 h-4" />}
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-bold text-zinc-950 group-hover:text-zinc-700 transition-colors">{env.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.24em] bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded shadow-sm">v{env.version}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Sync</p>
              <p className="text-xs font-medium text-zinc-600">{formatLastSync(env.lastSync)}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
