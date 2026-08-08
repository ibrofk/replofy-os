/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { CommandPalette } from './components/CommandPalette';
import { ExecutionStudioPage } from './pages/ExecutionStudioPage';
import { ContentStudioPage } from './pages/ContentStudioPage';
import { SystemsStudioPage } from './pages/SystemsStudioPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { InvitationDecisionPage } from './pages/InvitationDecisionPage';
import { TeamPage } from './pages/TeamPage';
import { TeamChatPage } from './pages/TeamChatPage';
import { TasksPage } from './pages/TasksPage';
import { GrowthPipelinePage } from './pages/GrowthPipelinePage';
import { Week13ReviewPage } from './pages/Week13ReviewPage';
import { BlogStudioPage } from './pages/BlogStudioPage';
import { BusinessPlanPage } from './pages/BusinessPlanPage';
import { TechnicalStudioPage } from './pages/TechnicalStudioPage';
import { CreativeHubPage } from './pages/CreativeHubPage';
import { SettingsPage } from './pages/SettingsPage';
import { OAuthAuthorizePage } from './pages/OAuthAuthorizePage';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { OperatorDesksPage } from './pages/OperatorDesksPage';
import { OperatorDeskDetailPage } from './pages/OperatorDeskDetailPage';
import { ApprovalInboxPage } from './pages/ApprovalInboxPage';
import { OutputDetailPage } from './pages/OutputDetailPage';
import { WorkOrderDetailPage } from './pages/WorkOrderDetailPage';
import { McpRegistryPage } from './pages/McpRegistryPage';
import { UserProfile, type Invitation } from './types';

import { UserContext } from './contexts/UserContext';
import { GlobalStateProvider } from './contexts/GlobalStateContext';
import { CommunicationProvider } from './contexts/CommunicationContext';
import logo from './assets/logo-compact.png';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadUserProfile = useCallback(async (firebaseUser: any) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);
      let pendingInvite: Invitation | null = null;

      if (firebaseUser.email) {
        try {
          const invitesQ = query(collection(db, 'invitations'), where('email', '==', firebaseUser.email.toLowerCase()));
          const invitesSnap = await getDocs(invitesQ);
          const matchingInvite = invitesSnap.docs
            .map((inviteDoc) => ({ id: inviteDoc.id, ...(inviteDoc.data() as Omit<Invitation, 'id'>) }))
            .find((invite) => invite.status !== 'accepted' && invite.status !== 'rejected');

          if (matchingInvite) {
            pendingInvite = matchingInvite;
          }
        } catch (inviteError) {
          console.warn('Failed to check invitations, continuing without invite:', inviteError);
        }
      }

      if (userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        setUserProfile(profile);
        setPendingInvitation(
          pendingInvite && profile.acceptedInvitationId !== pendingInvite.id && profile.rejectedInvitationId !== pendingInvite.id ? pendingInvite : null
        );
      } else if (pendingInvite) {
        setPendingInvitation(pendingInvite);
        setUserProfile(null);
        setAuthError(null);
        return;
      } else {
        setUserProfile(null);
        setPendingInvitation(null);
        setAuthError('This account has no Replofy OS profile or pending workspace invitation.');
        return;
      }
      setAuthError(null);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to load user profile');
      setUserProfile(null);
      setPendingInvitation(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadUserProfile(firebaseUser);
      } else {
        setUserProfile(null);
        setPendingInvitation(null);
        setAuthError(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [loadUserProfile]);

  const handleRetryAuth = useCallback(async () => {
    if (!user) return;
    setAuthError(null);
    setLoading(true);
    await loadUserProfile(user);
    setLoading(false);
  }, [user, loadUserProfile]);

  const handleOnboardingComplete = useCallback((updatedProfile?: UserProfile) => {
    if (updatedProfile) {
      setUserProfile(updatedProfile);
    } else if (userProfile) {
      setUserProfile({ ...userProfile, onboardingCompleted: true });
    }
    setPendingInvitation(null);
  }, [userProfile]);

  const handleInvitationAccepted = useCallback((updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    setPendingInvitation(null);
    setAuthError(null);
  }, []);

  const handleInvitationRejected = useCallback((updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    setPendingInvitation(null);
    setAuthError(null);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 text-zinc-900">
        <div className="animate-pulse font-mono text-sm text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (window.location.pathname === '/oauth/authorize') {
    return <OAuthAuthorizePage user={user} userProfile={userProfile} authError={authError} />;
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="bg-white p-10 rounded-[2rem] shadow-sm border border-zinc-200 max-w-sm w-full text-center">
          <img src={logo} alt="Replofy OS" className="h-10 w-auto mx-auto mb-6 mix-blend-multiply" />
          <p className="text-sm text-zinc-500 mb-6">Sign in to access your internal tools.</p>
          <button
            onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
            className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-semibold py-3 px-6 rounded-full transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Auth error state — user is logged in but profile failed to load
  if (authError || (!userProfile && !pendingInvitation)) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="bg-white p-10 rounded-[2rem] shadow-sm border border-zinc-200 max-w-sm w-full text-center">
          <img src={logo} alt="Replofy OS" className="h-10 w-auto mx-auto mb-6 mix-blend-multiply" />
          <h2 className="text-lg font-bold text-zinc-900 mb-2">Connection Issue</h2>
          <p className="text-sm text-zinc-500 mb-2">
            {authError || 'Unable to load your profile. The database may be starting up.'}
          </p>
          <p className="text-xs text-zinc-400 mb-6">
            If you're running locally, make sure the Firebase emulators are running.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRetryAuth}
              className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-semibold py-3 px-6 rounded-full transition-colors"
            >
              Retry Connection
            </button>
            <button
              onClick={() => auth.signOut()}
              className="w-full bg-white hover:bg-zinc-50 text-zinc-700 font-semibold py-3 px-6 rounded-full transition-colors border border-zinc-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pendingInvitation) {
    return (
      <InvitationDecisionPage
        invitation={pendingInvitation}
        userProfile={userProfile}
        onAccepted={handleInvitationAccepted}
        onRejected={handleInvitationRejected}
      />
    );
  }

  if (userProfile.invitationRejectedAt && !userProfile.companyId) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 text-zinc-900">
        <div className="bg-white p-10 rounded-[2rem] shadow-sm border border-zinc-200 max-w-md w-full text-center">
          <img src={logo} alt="Replofy OS" className="h-10 w-auto mx-auto mb-6 mix-blend-multiply" />
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Invitation declined</h2>
          <p className="text-sm text-zinc-500 mb-6">
            This account has declined the current workspace invitation. You will need a new invitation to continue.
          </p>
          <button
            onClick={() => auth.signOut()}
            className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-semibold py-3 px-6 rounded-full transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!userProfile.onboardingCompleted) {
    return <OnboardingPage userProfile={userProfile} onComplete={handleOnboardingComplete} />;
  }

  return (
    <UserContext.Provider value={{ userProfile }}>
      <GlobalStateProvider uid={user.uid} companyId={userProfile?.companyId}>
        <CommunicationProvider uid={user.uid} companyId={userProfile?.companyId}>
          <BrowserRouter>
            <div className="flex h-screen flex-col md:flex-row bg-zinc-50 text-zinc-900 overflow-hidden">
              <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Mobile Header */}
                <div className="md:hidden flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 shrink-0 z-10">
                  <div className="flex items-center gap-2">
                    <img src={logo} alt="Replofy" className="h-6 w-auto mix-blend-multiply" />
                    <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.24em] text-white">
                      OS
                    </span>
                  </div>
                  <button onClick={() => setMobileMenuOpen(true)} className="p-2 -mr-2 text-zinc-500 hover:text-zinc-900">
                    <Menu className="w-5 h-5" />
                  </button>
                </div>
                <main className="flex-1 overflow-y-auto w-full">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/dashboard" element={<Navigate to="/" replace />} />
                    <Route path="/command-center" element={<CommandCenterPage />} />
                    <Route path="/operator-desks" element={<OperatorDesksPage />} />
                    <Route path="/operator-desks/:deskId" element={<OperatorDeskDetailPage />} />
                    <Route path="/os-operators" element={<Navigate to="/operator-desks" replace />} />
                    <Route path="/os-operators/:operatorId" element={<Navigate to="/operator-desks" replace />} />
                    <Route path="/approval-inbox" element={<ApprovalInboxPage />} />
                    <Route path="/operator-outputs/:outputId" element={<OutputDetailPage />} />
                    <Route path="/work-orders/:workOrderId" element={<WorkOrderDetailPage />} />
                    <Route path="/mcp-registry" element={<McpRegistryPage />} />
                    <Route path="/execution" element={<ExecutionStudioPage />} />
                    <Route path="/content" element={<ContentStudioPage />} />
                    <Route path="/systems" element={<SystemsStudioPage />} />
                    <Route path="/technical-studio" element={<TechnicalStudioPage />} />
                    <Route path="/creative-hub" element={<CreativeHubPage />} />
                    <Route path="/team" element={<TeamPage />} />
                    <Route path="/team-chat" element={<TeamChatPage />} />
                    <Route path="/chat" element={<Navigate to="/team-chat" replace />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/growth" element={<GrowthPipelinePage />} />
                    <Route path="/week-13" element={<Week13ReviewPage />} />
                    <Route path="/business-plan" element={<BusinessPlanPage />} />
                    <Route path="/blogs" element={<BlogStudioPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
              <CommandPalette />
            </div>
          </BrowserRouter>
        </CommunicationProvider>
      </GlobalStateProvider>
    </UserContext.Provider>
  );
}
