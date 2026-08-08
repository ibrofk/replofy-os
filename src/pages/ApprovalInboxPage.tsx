import React, { useMemo, useState } from 'react';
import { Archive, Check, ExternalLink, Pencil, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { useOperatorDesk } from '../hooks/useOperatorDesk';
import { resolveOperatorApproval } from '../services/operatorDeskService';
import { OperatorApproval } from '../types';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { db } from '../firebase';
import { approvalPlainText, getDeskName, riskCopy, riskLabels } from '../utils/operatorDisplayLabels';
import { Empty, Page } from './CommandCenterPage';

export function ApprovalInboxPage() {
  const { userProfile } = useUser();
  const { approvals, desks, outputs } = useOperatorDesk();
  const navigate = useNavigate();
  const [decision, setDecision] = useState<{ item: OperatorApproval; type: 'approve' | 'reject' | 'archive' } | null>(null);
  const [editing, setEditing] = useState<OperatorApproval | null>(null);
  const [summary, setSummary] = useState('');
  const pending = approvals.filter((item) => item.status === 'pending' || item.status === 'edited');
  const deskById = useMemo(() => new Map(desks.map((desk) => [desk.id, desk])), [desks]);
  const outputById = useMemo(() => new Map(outputs.map((output) => [output.id, output])), [outputs]);

  const closeDecision = () => setDecision(null);
  const resolve = async () => {
    if (!userProfile || !decision) return;
    if (decision.type === 'archive') {
      await updateDoc(doc(db, 'operatorApprovals', decision.item.id), { status: 'expired', updatedAt: new Date().toISOString() });
    } else {
      await resolveOperatorApproval(userProfile, decision.item, decision.type);
    }
    closeDecision();
  };

  const openEdit = (item: OperatorApproval) => {
    setEditing(item);
    setSummary(item.summary);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await updateDoc(doc(db, 'operatorApprovals', editing.id), { summary, status: 'edited', updatedAt: new Date().toISOString() });
    setEditing(null);
  };

  const selectedDeskName = decision ? getDeskName(deskById.get(decision.item.operatorDeskId)) : 'This operator';

  return (
    <Page title="Approval Inbox" subtitle="Review operator proposals before they change tasks, content, memory, or shared workspace records.">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {pending.length === 0 ? <Empty>No approvals need your review.</Empty> : pending.map((item) => {
          const deskName = getDeskName(deskById.get(item.operatorDeskId));
          const output = item.outputId ? outputById.get(item.outputId) : undefined;
          return (
            <div key={item.id} className="border-b border-zinc-100 p-4 last:border-0">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-black">{approvalPlainText(item, deskName)}</h2>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">{riskLabels[item.riskLevel]}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{item.summary}</p>
                  <p className="mt-2 text-xs font-bold text-zinc-400">{riskCopy(item.riskLevel)}</p>
                  {output?.content && <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{output.content}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={!item.outputId} onClick={() => item.outputId && navigate(`/operator-outputs/${item.outputId}`)} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold disabled:text-zinc-300"><ExternalLink className="h-3 w-3" /> View output</button>
                  <button onClick={() => openEdit(item)} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold"><Pencil className="h-3 w-3" /> Edit summary</button>
                  <button onClick={() => setDecision({ item, type: 'archive' })} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold"><Archive className="h-3 w-3" /> Archive</button>
                  <button onClick={() => setDecision({ item, type: 'reject' })} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold"><X className="h-3 w-3" /> Reject</button>
                  <button onClick={() => setDecision({ item, type: 'approve' })} className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-3 py-2 text-xs font-bold text-white"><Check className="h-3 w-3" /> Approve</button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <Modal
        open={Boolean(editing)}
        title="Edit Approval Summary"
        description="Update the plain-language summary shown before approval."
        onClose={() => setEditing(null)}
        footer={(
          <>
            <button onClick={() => setEditing(null)} className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold">Cancel</button>
            <button onClick={() => void saveEdit()} className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white">Save</button>
          </>
        )}
      >
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="min-h-32 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" />
      </Modal>

      <ConfirmDialog
        open={Boolean(decision)}
        title={decision?.type === 'approve' ? 'Approve operator change?' : decision?.type === 'reject' ? 'Reject operator change?' : 'Archive approval?'}
        description={decision ? `${approvalPlainText(decision.item, selectedDeskName)} ${riskCopy(decision.item.riskLevel)}` : ''}
        confirmLabel={decision?.type === 'approve' ? 'Approve' : decision?.type === 'reject' ? 'Reject' : 'Archive'}
        danger={decision?.type !== 'approve'}
        onConfirm={resolve}
        onClose={closeDecision}
      />
    </Page>
  );
}
