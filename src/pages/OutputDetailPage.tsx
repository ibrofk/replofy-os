import React from 'react';
import { useParams } from 'react-router-dom';
import { useOperatorDesk } from '../hooks/useOperatorDesk';
import { Empty, Page, Panel, Row } from './CommandCenterPage';

export function OutputDetailPage() {
  const { outputId } = useParams();
  const { outputs, injections, approvals, memories, checkins } = useOperatorDesk();
  const output = outputs.find((item) => item.id === outputId);
  if (!output) return <Page title="Output Detail" subtitle="Loading Submitted Output..."><Empty>Submitted Output not found yet.</Empty></Page>;
  const outputInjections = injections.filter((item) => item.outputId === output.id);
  const outputApprovals = approvals.filter((item) => item.outputId === output.id);
  const outputMemories = memories.filter((item) => item.sourceOutputId === output.id);
  const outputCheckins = checkins.filter((item) => item.payload?.outputId === output.id || item.workOrderId === output.workOrderId);
  return <Page title="Output Detail" subtitle="Submitted content, source references, Smart Routing result, approval status, memory suggestions, and injection status.">
    <div className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-white"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{output.outputType} / {output.status}</p><h2 className="mt-2 text-xl font-black">{output.title}</h2><p className="mt-2 text-sm text-white/60">{output.summary}</p><p className="mt-2 text-xs text-white/45">Submitted by {output.externalAgentName} at {new Date(output.createdAt).toLocaleString()}</p></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Submitted Content" subtitle="External agent output."><div className="whitespace-pre-wrap p-4 text-sm leading-6 text-zinc-700">{output.content}</div></Panel>
      <Panel title="Source References" subtitle="References supplied by the external agent.">{output.sourceReferences.length ? output.sourceReferences.map((item, index) => <Row key={index} title={String(item.title || item.id || `Source ${index + 1}`)} detail={String(item.summary || item.sourceKey || 'source reference')} />) : <Empty>No source references submitted.</Empty>}</Panel>
      <Panel title="Smart Routing Result" subtitle="Proposed destinations and status.">{outputInjections.length ? outputInjections.map((item) => <Row key={item.id} title={item.targetHub} detail={`${item.action} / ${item.riskLevel} / ${item.status}`} />) : <Empty>{output.routingWarning || 'No routing proposals yet.'}</Empty>}</Panel>
      <Panel title="Approval Status" subtitle="Risky writes wait here.">{outputApprovals.length ? outputApprovals.map((item) => <Row key={item.id} title={item.title} detail={`${item.action} / ${item.targetHub} / ${item.status}`} />) : <Empty>No approvals requested.</Empty>}</Panel>
      <Panel title="Memory Suggestions" subtitle="Visible suggestions requiring review.">{outputMemories.length ? outputMemories.map((item) => <Row key={item.id} title={item.content} detail={`${item.state} / ${item.confidence}`} />) : <Empty>No memory suggestions.</Empty>}</Panel>
      <Panel title="Related Check-ins" subtitle="Agent activity linked to this output.">{outputCheckins.length ? outputCheckins.map((item) => <Row key={item.id} title={item.type} detail={`${item.externalAgentName} / ${item.summary}`} />) : <Empty>No related check-ins.</Empty>}</Panel>
    </div>
  </Page>;
}
