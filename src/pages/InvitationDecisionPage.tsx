import React, { useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { auth, db } from '../firebase';
import { Invitation, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export function InvitationDecisionPage({
  invitation,
  userProfile,
  onAccepted,
  onRejected,
}: {
  invitation: Invitation;
  userProfile: UserProfile | null;
  onAccepted: (updatedProfile: UserProfile) => void;
  onRejected: (updatedProfile: UserProfile) => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentUser = auth.currentUser;

  const displayName = useMemo(
    () => userProfile?.displayName || currentUser?.displayName || currentUser?.email || invitation.email,
    [currentUser?.displayName, currentUser?.email, invitation.email, userProfile?.displayName]
  );

  const handleDecision = async (decision: 'accept' | 'reject') => {
    if (!currentUser) return;

    setIsProcessing(true);
    setErrorMessage(null);
    const now = new Date().toISOString();
    const userRef = doc(db, 'users', currentUser.uid);
    const inviteRef = doc(db, 'invitations', invitation.id);
    const batch = writeBatch(db);

    try {
      if (decision === 'accept') {
        const updatedProfile: UserProfile = userProfile
          ? {
              ...userProfile,
              role: invitation.role,
              companyId: invitation.companyId,
              onboardingCompleted: true,
              acceptedInvitationId: invitation.id,
              invitationAcceptedAt: now,
            }
          : {
              id: currentUser.uid,
              email: currentUser.email || invitation.email,
              displayName,
              role: invitation.role,
              companyId: invitation.companyId,
              onboardingCompleted: true,
              acceptedInvitationId: invitation.id,
              invitationAcceptedAt: now,
              createdAt: now,
            };

        batch.set(userRef, updatedProfile, { merge: true });
        batch.set(inviteRef, { status: 'accepted', respondedAt: now, respondedBy: currentUser.uid }, { merge: true });
        await batch.commit();

        onAccepted(updatedProfile);
        return;
      }

      const updatedProfile: UserProfile = userProfile
          ? {
              ...userProfile,
              rejectedInvitationId: invitation.id,
              invitationRejectedAt: now,
            }
          : {
              id: currentUser.uid,
              email: currentUser.email || invitation.email,
              displayName,
              role: invitation.role,
              onboardingCompleted: false,
              rejectedInvitationId: invitation.id,
              invitationRejectedAt: now,
              createdAt: now,
            };

      batch.set(userRef, updatedProfile, { merge: true });
      batch.set(inviteRef, { status: 'rejected', respondedAt: now, respondedBy: currentUser.uid }, { merge: true });
      await batch.commit();

      onRejected(updatedProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'invitation decision');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save invitation decision.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 text-zinc-900 px-4">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 max-w-lg w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-950 text-white">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Workspace Invitation</p>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">Accept or reject access</h1>
          </div>
        </div>

        <p className="text-sm text-zinc-500 mb-6">
          You were invited to join <span className="font-semibold text-zinc-900">{invitation.companyId}</span>.
          Choose whether to accept the workspace invite or reject it before any workspace routes can load.
        </p>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 mb-6 text-sm text-zinc-600 space-y-1">
          <div><span className="font-semibold text-zinc-900">Email:</span> {invitation.email}</div>
          <div><span className="font-semibold text-zinc-900">Name:</span> {displayName}</div>
          <div><span className="font-semibold text-zinc-900">Role:</span> {invitation.role}</div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => handleDecision('accept')}
            disabled={isProcessing}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Accept invitation
          </button>
          <button
            onClick={() => handleDecision('reject')}
            disabled={isProcessing}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject invitation
          </button>
        </div>
      </div>
    </div>
  );
}
