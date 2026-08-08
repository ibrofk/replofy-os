import React from 'react';
import { useParams } from 'react-router-dom';
import { useOperatorDesk } from '../hooks/useOperatorDesk';
import { Empty, Page, Panel, Row } from './CommandCenterPage';

export function WorkOrderDetailPage() {
  const { workOrderId } = useParams();
  const { workOrders, contextPacks, outputs, checkins } = useOperatorDesk();
  const workOrder = workOrders.find((item) => item.id === workOrderId);
  if (!workOrder) return <Page title="Work Order" subtitle="Loading Work Order..."><Empty>Work Order not found yet.</Empty></Page>;
  const packs = contextPacks.filter((pack) => workOrder.contextPackIds.includes(pack.id));
  const submittedOutputs = outputs.filter((output) => output.workOrderId === workOrder.id);
  const relatedCheckins = checkins.filter((checkin) => checkin.workOrderId === workOrder.id);
  return <Page title={workOrder.title} subtitle={workOrder.brief}>
    <div className="grid gap-4 md:grid-cols-4">
      <Stat label="Status" value={workOrder.status} />
      <Stat label="Priority" value={workOrder.priority} />
      <Stat label="Approval Mode" value={workOrder.approvalMode} />
      <Stat label="Claimed By" value={workOrder.claimedBy || 'Unclaimed'} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Expected Outputs" subtitle="What external agents should submit.">{workOrder.expectedOutputTypes.map((type) => <Row key={type} title={type} detail="accepted output type" />)}</Panel>
      <Panel title="Context Packs" subtitle="Context attached to this work.">{packs.length ? packs.map((pack) => <Row key={pack.id} title={pack.title} detail={pack.expectedUse || pack.description} />) : <Empty>No Context Packs attached.</Empty>}</Panel>
      <Panel title="Submitted Outputs" subtitle="External agent results.">{submittedOutputs.length ? submittedOutputs.map((output) => <Row key={output.id} title={output.title} detail={`${output.outputType} / ${output.status}`} />) : <Empty>No outputs submitted.</Empty>}</Panel>
      <Panel title="Related Check-ins" subtitle="Agent activity history.">{relatedCheckins.length ? relatedCheckins.map((checkin) => <Row key={checkin.id} title={checkin.type} detail={`${checkin.externalAgentName} / ${checkin.summary}`} />) : <Empty>No check-ins yet.</Empty>}</Panel>
    </div>
  </Page>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-zinc-400">{label}</p><p className="mt-2 text-sm font-black text-zinc-900">{value}</p></div>;
}
