import React from 'react';
import { getOperatorMcpRegistry } from '../services/operatorDeskService';
import { Page } from './CommandCenterPage';

export function McpRegistryPage() {
  const actions = getOperatorMcpRegistry();
  return <Page title="MCP Registry" subtitle="Actions external agents use to read Operator Desks, claim Work Orders, submit Agent Check-ins, submit Submitted Outputs, and route work through Approval Inbox.">
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_0.7fr_1fr] gap-3 border-b border-zinc-100 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-400">
        <span>Action name</span><span>Description</span><span>Permission</span><span>Risk</span><span>Enabled</span><span>Last used</span>
      </div>
      <div className="divide-y divide-zinc-100">
        {actions.map((action) => <div key={action.actionName} className="grid grid-cols-[1.5fr_2fr_1fr_1fr_0.7fr_1fr] gap-3 px-4 py-3 text-sm">
          <span className="font-bold text-zinc-900">{action.actionName}</span>
          <span className="text-zinc-500">{action.description}</span>
          <span className="text-zinc-500">{action.permissionLevel}</span>
          <span className="text-zinc-500">{action.riskLevel}</span>
          <span className="text-zinc-500">{action.enabled ? 'enabled' : 'disabled'}</span>
          <span className="text-zinc-500">{action.lastUsedAt || 'never'}</span>
        </div>)}
      </div>
    </section>
  </Page>;
}
