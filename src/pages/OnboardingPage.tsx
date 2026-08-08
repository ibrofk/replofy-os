import React, { useMemo, useState } from 'react';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Company } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { CheckCircle, Loader2 } from 'lucide-react';
import { FileIngestionPanel } from '../components/context/FileIngestionPanel';

export function OnboardingPage({
  userProfile,
  onComplete,
}: {
  userProfile: UserProfile;
  onComplete: (updatedProfile?: UserProfile) => void;
}) {
  const [companyName, setCompanyName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [updatedProfileState, setUpdatedProfileState] = useState<UserProfile | null>(null);

  const onboardingProfile = useMemo(
    () =>
      updatedProfileState ||
      (createdCompanyId
        ? {
            ...userProfile,
            companyId: createdCompanyId,
          }
        : userProfile),
    [createdCompanyId, updatedProfileState, userProfile]
  );

  const handleCreateCompany = async () => {
    if (!companyName.trim()) return;

    setIsProcessing(true);
    try {
      const companyRef = doc(collection(db, 'companies'));
      const newCompany: Company = {
        id: companyRef.id,
        name: companyName,
        createdAt: new Date().toISOString(),
        ownerId: userProfile.id,
      };

      await setDoc(companyRef, newCompany);

      const userRef = doc(db, 'users', userProfile.id);
      const updatedProfile = { ...userProfile, companyId: newCompany.id };
      if (updatedProfile.companyId === undefined) {
        delete updatedProfile.companyId;
      }
      Object.keys(updatedProfile).forEach((key) => {
        if ((updatedProfile as any)[key] === undefined) {
          delete (updatedProfile as any)[key];
        }
      });

      await setDoc(userRef, updatedProfile, { merge: true });

      setCreatedCompanyId(newCompany.id);
      setUpdatedProfileState(updatedProfile);
      setStep(2);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'companies');
    } finally {
      setIsProcessing(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      const userRef = doc(db, 'users', userProfile.id);
      await setDoc(userRef, { onboardingCompleted: true }, { merge: true });

      const finalProfile = updatedProfileState
        ? { ...updatedProfileState, onboardingCompleted: true }
        : { ...userProfile, onboardingCompleted: true };

      onComplete(finalProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 text-zinc-900">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-zinc-200 max-w-3xl w-full">
        {step === 1 ? (
          <>
            <h1 className="text-3xl font-black tracking-tight mb-2">Welcome to Replofy OS</h1>
            <p className="text-zinc-500 text-sm mb-6">Let&apos;s set up your workspace.</p>

            <div className="mb-4 space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border-b border-zinc-200 bg-transparent py-3 text-lg font-medium text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
                placeholder="Acme Corp"
              />
            </div>

            <button
              onClick={handleCreateCompany}
              disabled={!companyName.trim() || isProcessing}
              className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-semibold py-3 px-6 rounded-full transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Workspace'}
            </button>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-zinc-600">
              <CheckCircle className="w-5 h-5" />
              <h1 className="text-3xl font-black tracking-tight text-zinc-900">Workspace Created</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Upload one or more strategy documents, OKRs, or notes. Replofy will reuse matching records and create new items only when needed.
            </p>

            <FileIngestionPanel
              mode="onboarding"
              userProfile={onboardingProfile}
              onSkip={completeOnboarding}
              onFinished={completeOnboarding}
            />
          </div>
        )}
      </div>
    </div>
  );
}
