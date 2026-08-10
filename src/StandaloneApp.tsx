import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { LogOut, Settings2 } from 'lucide-react';
import { GlobalStateProvider } from './contexts/GlobalStateContext';
import { UserContext } from './contexts/UserContext';
import { ExecutionStudioPage } from './pages/ExecutionStudioPage';
import { TasksPage } from './pages/TasksPage';
import { StandaloneJoinPage } from './pages/StandaloneJoinPage';
import { StandaloneTeamPage } from './pages/StandaloneTeamPage';
import { StandaloneTeamChatPage } from './pages/StandaloneTeamChatPage';
import { StandaloneContentPage } from './pages/StandaloneContentPage';
import { StandaloneOperatorsPage } from './pages/StandaloneOperatorsPage';
import { StandaloneCreativePage } from './pages/StandaloneCreativePage';
import { StandaloneGrowthPage } from './pages/StandaloneGrowthPage';
import { StandaloneTechnicalPage } from './pages/StandaloneTechnicalPage';
import { StandaloneSystemsPage } from './pages/StandaloneSystemsPage';
import { StandalonePlanningPage } from './pages/StandalonePlanningPage';
import { StandaloneStrategyPage } from './pages/StandaloneStrategyPage';
import { StandaloneAIPage } from './pages/StandaloneAIPage';
import { StandaloneAIContextPanel } from './components/ai/StandaloneAIContextPanel';
import { StandaloneAIStatusLink } from './components/ai/StandaloneAIStatusLink';
import { localAuthClient } from './services/localAuthClient';
import {
  StandaloneApiError,
  standaloneClient,
  type StandaloneWorkspace,
  type StandaloneWorkspaceState,
} from './services/standaloneClient';
import type { UserProfile } from './types';
import logo from './assets/logo-compact.png';

type AccessMode = 'checking' | 'bootstrap' | 'login';
type LocalSession = {
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string | Date;
  };
  session: {
    id: string;
  };
};

function AccessCard({
  mode,
  onAuthenticated,
}: {
  mode: Exclude<AccessMode, 'checking'>;
  onAuthenticated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'bootstrap') {
        await standaloneClient.bootstrap({
          token: bootstrapToken,
          name,
          email,
          password,
          workspaceName,
          workspaceSlug,
        });
      }
      const result = await localAuthClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || 'Sign in failed.');
      await onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Access failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
        <img src={logo} alt="Replofy OS" className="mx-auto mb-6 h-10 w-auto mix-blend-multiply" />
        <h1 className="text-center text-xl font-bold text-zinc-950">
          {mode === 'bootstrap' ? 'Create this Replofy OS instance' : 'Sign in to Replofy OS'}
        </h1>
        <p className="mb-6 mt-2 text-center text-sm text-zinc-500">
          {mode === 'bootstrap'
            ? 'This one-time setup creates the first owner and workspace.'
            : 'Use the local email and password configured for this instance.'}
        </p>

        <div className="space-y-3">
          {mode === 'bootstrap' && (
            <>
              <Field label="Bootstrap token" value={bootstrapToken} onChange={setBootstrapToken} type="password" />
              <Field label="Your name" value={name} onChange={setName} autoComplete="name" />
              <Field label="Workspace name" value={workspaceName} onChange={(value) => {
                setWorkspaceName(value);
                setWorkspaceSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
              }} />
              <Field label="Workspace slug" value={workspaceSlug} onChange={setWorkspaceSlug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
            </>
          )}
          <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'}
            minLength={12}
          />
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-full bg-zinc-950 px-6 py-3 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Working…' : mode === 'bootstrap' ? 'Create instance' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</span>
      <input
        {...inputProps}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
      />
    </label>
  );
}

function StandaloneWorkspaceApp({
  session,
}: {
  session: LocalSession;
}) {
  const [workspaceState, setWorkspaceState] = useState<StandaloneWorkspaceState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = async () => {
    try {
      const state = await standaloneClient.workspaces();
      if (!state.activeWorkspaceId && state.workspaces[0]) {
        await standaloneClient.activateWorkspace(state.workspaces[0].id);
        state.activeWorkspaceId = state.workspaces[0].id;
      }
      setWorkspaceState(state);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load workspaces.');
    }
  };

  useEffect(() => {
    void loadWorkspaces();
  }, [session.user.id]);

  const activeWorkspace = useMemo(
    () => workspaceState?.workspaces.find((workspace) => workspace.id === workspaceState.activeWorkspaceId) ?? null,
    [workspaceState],
  );

  const activateWorkspace = async (workspace: StandaloneWorkspace) => {
    await standaloneClient.activateWorkspace(workspace.id);
    setWorkspaceState((current) => current ? { ...current, activeWorkspaceId: workspace.id } : current);
  };

  if (error) {
    return <CenteredStatus title="Workspace unavailable" detail={error} action={loadWorkspaces} />;
  }
  if (!workspaceState) return <CenteredStatus title="Loading workspace…" />;
  if (!activeWorkspace) {
    return <CenteredStatus title="No workspace membership" detail="This account does not belong to a workspace." />;
  }

  const role: UserProfile['role'] =
    activeWorkspace.role === 'owner' ? 'master-admin' : activeWorkspace.role;
  const userProfile: UserProfile = {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.name,
    companyId: activeWorkspace.id,
    role,
    onboardingCompleted: true,
    createdAt: new Date(session.user.createdAt).toISOString(),
  };

  return (
    <UserContext.Provider value={{ userProfile }}>
      <GlobalStateProvider uid={session.user.id} companyId={activeWorkspace.id}>
        <BrowserRouter>
          <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-900">
            <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 py-3">
              <div className="flex items-center gap-3">
                <img src={logo} alt="Replofy OS" className="h-7 w-auto mix-blend-multiply" />
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">
                  Standalone preview
                </span>
              </div>
              <div className="flex items-center gap-3">
                <StandaloneAIStatusLink key={activeWorkspace.id} />
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border-zinc-950 bg-zinc-950 text-white'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-950'
                    }`
                  }
                >
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </NavLink>
                {workspaceState.workspaces.length > 1 && (
                  <select
                    value={activeWorkspace.id}
                    onChange={(event) => {
                      const workspace = workspaceState.workspaces.find((item) => item.id === event.target.value);
                      if (workspace) void activateWorkspace(workspace);
                    }}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    {workspaceState.workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                    ))}
                  </select>
                )}
                <span className="hidden text-sm text-zinc-500 sm:block">{session.user.email}</span>
                <button
                  onClick={() => void localAuthClient.signOut()}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-xs text-amber-900">
              Visible standalone modules use PostgreSQL. Unmigrated Firebase modules stay hidden until their platform contracts are ready.
            </div>
            <nav aria-label="Replofy modules" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-5 py-2">
              {[
                { to: '/execution', label: 'Execution' },
                { to: '/tasks', label: 'Tasks' },
                { to: '/team-chat', label: 'Team Chat' },
                { to: '/content', label: 'Content' },
                { to: '/operators', label: 'Operators' },
                { to: '/creative', label: 'Creative' },
                { to: '/growth', label: 'Growth' },
                { to: '/technical', label: 'Technical' },
                { to: '/systems', label: 'Systems' },
                { to: '/planning', label: 'Plans & Context' },
                { to: '/strategy', label: 'Strategy' },
                { to: '/team', label: 'Team' },
                { to: '/ai', label: 'AI workspace' },
                { to: '/settings', label: 'Settings' },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      isActive ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <main className="min-h-0 flex-1 overflow-y-auto">
              <Routes>
                <Route path="/execution" element={<ExecutionStudioPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/team-chat" element={<StandaloneTeamChatPage />} />
                <Route path="/content" element={<StandaloneContentPage />} />
                <Route path="/operators" element={<StandaloneOperatorsPage />} />
                <Route path="/creative" element={<StandaloneCreativePage />} />
                <Route path="/growth" element={<StandaloneGrowthPage />} />
                <Route path="/technical" element={<StandaloneTechnicalPage />} />
                <Route path="/systems" element={<StandaloneSystemsPage />} />
                <Route path="/planning" element={<StandalonePlanningPage />} />
                <Route path="/strategy" element={<StandaloneStrategyPage />} />
                <Route path="/team" element={<StandaloneTeamPage />} />
                <Route path="/ai" element={<StandaloneAIPage workspaceId={activeWorkspace.id} />} />
                <Route path="/settings" element={<StandaloneAIPage workspaceId={activeWorkspace.id} focus="settings" />} />
                <Route path="*" element={<Navigate to="/execution" replace />} />
              </Routes>
            </main>
            <StandaloneAIContextPanel key={activeWorkspace.id} />
          </div>
        </BrowserRouter>
      </GlobalStateProvider>
    </UserContext.Provider>
  );
}

function CenteredStatus({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: () => void | Promise<void>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-bold">{title}</h1>
        {detail && <p className="mt-2 text-sm text-zinc-500">{detail}</p>}
        {action && (
          <button onClick={() => void action()} className="mt-5 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default function StandaloneApp() {
  const { data: session, isPending, refetch } = localAuthClient.useSession();
  const currentSession = session as LocalSession | null;
  const [accessMode, setAccessMode] = useState<AccessMode>('checking');
  const [startupError, setStartupError] = useState<string | null>(null);

  const checkSetup = async () => {
    try {
      const status = await standaloneClient.setupStatus();
      setAccessMode(status.needsBootstrap ? 'bootstrap' : 'login');
      setStartupError(null);
    } catch (caught) {
      const message = caught instanceof StandaloneApiError && caught.statusCode === 503
        ? 'PostgreSQL is not ready yet.'
        : caught instanceof Error ? caught.message : 'Standalone server is unavailable.';
      setStartupError(message);
    }
  };

  useEffect(() => {
    void checkSetup();
  }, []);

  if (isPending) {
    return <CenteredStatus title="Starting Replofy OS…" />;
  }

  const invitationToken = window.location.pathname === '/join'
    ? new URLSearchParams(window.location.search).get('token')
    : null;
  if (invitationToken) {
    return (
      <StandaloneJoinPage
        token={invitationToken}
        sessionUser={currentSession?.user ?? null}
        onSessionChanged={refetch}
      />
    );
  }

  if (accessMode === 'checking') {
    return <CenteredStatus title="Starting Replofy OS…" detail={startupError || undefined} action={startupError ? checkSetup : undefined} />;
  }
  if (startupError) {
    return <CenteredStatus title="Standalone server unavailable" detail={startupError} action={checkSetup} />;
  }
  if (!currentSession) {
    return <AccessCard mode={accessMode} onAuthenticated={async () => {
      await refetch();
      setAccessMode('login');
    }} />;
  }
  return <StandaloneWorkspaceApp session={currentSession} />;
}
