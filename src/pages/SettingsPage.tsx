import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck, Trash2, AlertTriangle, LockKeyhole, User, Building, Settings, Sparkles, ExternalLink } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useUser } from '../contexts/UserContext';
import type { ApiKeyRecord, ApiKeyScope, Company } from '../types';
import { API_KEY_FULL_ACCESS_SCOPES, API_KEY_SCOPE_DEFINITIONS, API_KEY_SCOPE_GROUPS } from '../services/apiKeyScopes';
import { createApiKey, fetchApiKeys, revokeApiKey } from '../services/apiKeyClient';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { MetricCard } from '../components/ui/MetricCard';
import { NotificationBell } from '../components/NotificationBell';

const groupedScopes = API_KEY_SCOPE_GROUPS.map((group) => ({
  group,
  scopes: API_KEY_SCOPE_DEFINITIONS.filter((definition) => definition.group === group),
}));

function formatDate(value?: string | null) {
  if (!value) {
    return 'Never';
  }

  return new Date(value).toLocaleString();
}

function scopeLabel(scope: ApiKeyScope) {
  return API_KEY_SCOPE_DEFINITIONS.find((definition) => definition.scope === scope)?.title ?? scope;
}

type TabId = 'profile' | 'api-keys' | 'workspace' | 'notifications' | 'chatgpt-app';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile Settings', icon: User },
  { id: 'workspace', label: 'Workspace', icon: Building },
  { id: 'api-keys', label: 'API Keys', icon: KeyRound },
  { id: 'chatgpt-app', label: 'ChatGPT App', icon: Sparkles },
  { id: 'notifications', label: 'Notifications', icon: AlertTriangle },
];

export function SettingsPage() {
  const { userProfile } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>('api-keys');

  return (
    <div className="flex h-full flex-col bg-zinc-50 md:flex-row overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(24,24,27,0.08),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(161,161,170,0.09),transparent_25%)] pointer-events-none" />

      {/* Mobile Horizontal Chip Bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-zinc-200 bg-white/50 backdrop-blur-md px-4 py-3 shrink-0 z-10 space-x-2 scrollbar-hide">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                isActive
                  ? 'bg-zinc-950 text-white'
                  : 'bg-white text-zinc-600 border border-zinc-200 shadow-sm hover:text-zinc-900'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Desktop Vertical Sidebar */}
      <div className="hidden md:flex w-72 flex-col border-r border-zinc-200 bg-white/50 backdrop-blur-md shrink-0 py-8 z-10 h-full overflow-y-auto">
        <div className="px-8 pb-6 border-b border-zinc-100 mb-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Settings</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-900">Manage configuration</p>
        </div>
        <nav className="px-4 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-zinc-950 text-white shadow-md'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto relative z-10 w-full">
        <div className="absolute right-4 top-4 z-20 md:right-8 md:top-8">
          <NotificationBell />
        </div>
        <div className="mx-auto max-w-4xl p-4 md:p-8 lg:p-12 pb-24 space-y-10">
          {activeTab === 'api-keys' && <ApiKeysPanel userProfile={userProfile} />}
          {activeTab === 'chatgpt-app' && <ChatGPTAppPanel onOpenApiKeys={() => setActiveTab('api-keys')} />}
          {activeTab === 'profile' && <ProfilePanel userProfile={userProfile} />}
          {activeTab === 'workspace' && <WorkspacePanel userProfile={userProfile} />}
          {activeTab === 'notifications' && <div className="text-zinc-400 text-sm">Notifications coming soon</div>}
        </div>
      </div>
    </div>
  );
}

function ChatGPTAppPanel({ onOpenApiKeys }: { onOpenApiKeys: () => void }) {
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000';
  const mcpUrl = `${origin}/mcp`;
  const openApiUrl = `${origin}/api/v1/openapi.json`;

  const copyValue = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedTarget(label);
    window.setTimeout(() => setCopiedTarget((current) => (current === label ? null : current)), 2200);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950">ChatGPT App</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Connect ChatGPT to Replofy OS through the hosted MCP app endpoint. The OpenAPI schema remains available for Custom GPT Actions.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Primary path" value="MCP" icon={<Sparkles className="h-4 w-4" />} />
        <MetricCard label="Endpoint" value="/mcp" icon={<Settings className="h-4 w-4" />} />
        <MetricCard label="Auth" value="OAuth / key" icon={<ShieldCheck className="h-4 w-4" />} />
        <MetricCard label="Fallback" value="OpenAPI" icon={<ExternalLink className="h-4 w-4" />} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] items-start">
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                <Sparkles className="h-3.5 w-3.5" />
                Apps SDK connector
              </div>
              <h2 className="mt-3 text-xl font-black tracking-tight text-zinc-950">MCP endpoint</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Use this URL when creating a developer-mode connector in ChatGPT.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void copyValue('mcp', mcpUrl)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
            >
              {copiedTarget === 'mcp' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedTarget === 'mcp' ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="break-all font-mono text-sm font-semibold text-zinc-900">{mcpUrl}</div>
          </div>

          <div className="mt-6 grid gap-3">
            {[
              'Enable developer mode in ChatGPT Settings > Apps & Connectors.',
              'Create a connector, paste the MCP endpoint, and choose OAuth.',
              'Sign in with Google when ChatGPT opens the Replofy authorization screen.',
              'Refresh connector metadata after tool, schema, or auth changes.',
            ].map((step, index) => (
              <div key={step} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white">
                  {index + 1}
                </div>
                <p className="pt-1 text-sm leading-relaxed text-zinc-600">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Production auth
          </div>
          <h2 className="mt-3 text-xl font-black tracking-tight text-zinc-950">OAuth 2.1</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            ChatGPT should link through a user-specific OAuth grant. If the connector client cannot launch reauthentication, run the hosted endpoint with a scoped server-side API key.
          </p>

          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <p className="text-sm leading-relaxed text-emerald-900">
                OAuth codes, access tokens, refresh tokens, and Replofy API keys are stored hashed. Use key fallback only for controlled internal connectors.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenApiKeys}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-300"
          >
            <KeyRound className="h-4 w-4" />
            Manage fallback keys
          </button>
        </section>
      </div>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
          <KeyRound className="h-3.5 w-3.5" />
          Token fallback
        </div>
        <h2 className="mt-3 text-xl font-black tracking-tight text-zinc-950">Use an API key as the MCP credential</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Set these on the hosted Replofy OS server after generating a scoped API key. API-key mode avoids the ChatGPT OAuth redirect entirely.
        </p>
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs font-semibold leading-relaxed text-zinc-900">{`REPLOFY_CHATGPT_APP_AUTH_MODE=api-key
REPLOFY_CHATGPT_APP_API_KEY=ros_live_...`}</pre>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Use `hybrid` instead of `api-key` when you want OAuth to remain advertised while still letting unauthenticated tool calls fall back to the server key.
        </p>
      </section>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
              <ExternalLink className="h-3.5 w-3.5" />
              Custom GPT Actions fallback
            </div>
            <h2 className="mt-3 text-xl font-black tracking-tight text-zinc-950">OpenAPI schema</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Use this only when you want a Custom GPT Action instead of the Apps SDK connector.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void copyValue('openapi', openApiUrl)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-300"
          >
            {copiedTarget === 'openapi' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedTarget === 'openapi' ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="break-all font-mono text-sm font-semibold text-zinc-900">{openApiUrl}</div>
        </div>
      </section>
    </div>
  );
}

function ProfilePanel({ userProfile }: { userProfile: any }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-10">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950">Profile Settings</h1>
        <p className="mt-2 text-sm text-zinc-500 max-w-xl leading-relaxed">
          Manage your personal identity, how the team sees you, and your credentials.
        </p>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Display Name</label>
          <input
            type="text"
            defaultValue={userProfile?.displayName || ''}
            className="w-full border-b border-zinc-200 bg-transparent py-3 text-lg font-medium text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
            placeholder="Jane Doe"
          />
        </div>

        <div className="space-y-4">
          <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Email Address</label>
          <input
            type="email"
            defaultValue={userProfile?.email || ''}
            disabled
            className="w-full border-b border-zinc-200 bg-transparent py-3 text-lg font-medium text-zinc-500 cursor-not-allowed focus:outline-none"
          />
          <p className="text-xs text-zinc-400">Email addresses are tied to your authentication provider.</p>
        </div>

        <div className="pt-4">
          <button className="rounded-full bg-zinc-950 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 transition">
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspacePanel({ userProfile }: { userProfile: any }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!userProfile?.companyId) return;

    const fetchCompany = async () => {
      try {
        const companyRef = doc(db, 'companies', userProfile.companyId);
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          const companyData = companySnap.data() as Company;
          setCompany(companyData);
          setWorkspaceName(companyData.name);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `companies/${userProfile.companyId}`);
      }
    };

    fetchCompany();
  }, [userProfile?.companyId]);

  const handleSaveWorkspace = async () => {
    if (!userProfile?.companyId || !workspaceName.trim()) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateDoc(doc(db, 'companies', userProfile.companyId), {
        name: workspaceName.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `companies/${userProfile.companyId}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-10">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950">Workspace Setup</h1>
        <p className="mt-2 text-sm text-zinc-500 max-w-xl leading-relaxed">
          Configure global workspace defaults, execution cycle cadences, and team definitions.
        </p>
      </div>

      <div className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-8">
          <div className="space-y-4">
            <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Workspace Name</label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={!userProfile?.companyId}
              className="w-full border-b border-zinc-200 bg-transparent py-3 text-lg font-medium text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={userProfile?.companyId ? 'Loading...' : 'No company set'}
            />
            {!userProfile?.companyId && (
              <p className="text-xs text-amber-600">You are not part of a company workspace. Create one in onboarding or contact your admin.</p>
            )}
          </div>

          {userProfile?.companyId && (
            <div className="pt-4">
              <button
                onClick={handleSaveWorkspace}
                disabled={isSaving || !workspaceName.trim()}
                className="rounded-full bg-zinc-950 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Workspace'}
              </button>
            </div>
          )}

          <div className="space-y-4">
            <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Cycle Duration</label>
            <div className="flex gap-4">
              {['2 Weeks', '6 Weeks', '13 Weeks'].map((dur, i) => (
                <button
                  key={dur}
                  className={`flex-1 rounded-2xl border py-4 text-sm font-semibold transition ${
                    i === 2 ? 'border-zinc-900 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  {dur}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-400 pt-1">The standard delivery cycle cadence drives the Week 13 review.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiKeysPanel({ userProfile }: { userProfile: any }) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [canManageKeys, setCanManageKeys] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedRecord, setGeneratedRecord] = useState<ApiKeyRecord | null>(null);
  const [label, setLabel] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([...API_KEY_FULL_ACCESS_SCOPES]);

  const canEdit = canManageKeys;
  const formLocked = !canEdit || isSaving || isLoading;

  const sortedKeys = useMemo(
    () => [...keys].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [keys],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadKeys() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetchApiKeys();

        if (cancelled) return;

        setKeys(response.keys);
        setCanManageKeys(response.canManageKeys);
      } catch (loadError) {
        if (cancelled) return;
        setCanManageKeys(false);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load API keys.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    if (auth.currentUser) {
      void loadKeys();
    } else {
      setIsLoading(false);
      setError('You must be signed in to manage API keys.');
    }

    return () => {
      cancelled = true;
    };
  }, [userProfile?.companyId, userProfile?.role]);

  const toggleScope = (scope: ApiKeyScope) => {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const selectAllScopes = () => {
    setSelectedScopes([...API_KEY_FULL_ACCESS_SCOPES]);
  };

  const clearScopes = () => {
    setSelectedScopes([]);
  };

  const handleCreateKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim() || selectedScopes.length === 0 || !canEdit) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await createApiKey({
        label: label.trim(),
        scopes: selectedScopes,
      });

      setGeneratedKey(response.key);
      setGeneratedRecord(response.record);
      setSuccessMessage(response.warning);
      setLabel('');
      setSelectedScopes([...API_KEY_FULL_ACCESS_SCOPES]);

      const refreshed = await fetchApiKeys();
      setKeys(refreshed.keys);
      setCanManageKeys(refreshed.canManageKeys);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create the API key.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!window.confirm('Revoke this API key? Existing integrations will stop working immediately.')) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const response = await revokeApiKey({ keyId });
      setKeys((current) => current.map((item) => (item.id === response.record.id ? response.record : item)));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Failed to revoke the API key.');
    } finally {
      setIsSaving(false);
    }
  };

  const copyGeneratedKey = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setSuccessMessage('API key copied to clipboard.');
  };

  const companyLabel = userProfile?.companyId ? 'Company scoped' : 'Personal scoped';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950">Developer Access</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Issue programmatic keys for automation scripts and pipelines. Keys are hashed securely and scoped specifically matching UI domain boundaries.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Mode" value={companyLabel} icon={<KeyRound className="h-4 w-4" />} />
        <MetricCard label="Stored as" value="SHA-256" icon={<LockKeyhole className="h-4 w-4" />} />
        <MetricCard label="Active keys" value={keys.filter((item) => item.isActive).length} icon={<ShieldCheck className="h-4 w-4" />} />
        <MetricCard label="Scopes" value={selectedScopes.length} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {generatedKey && generatedRecord ? (
        <section className="rounded-[2rem] border border-zinc-900 bg-zinc-950 p-6 shadow-xl text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Key issued once
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight">
                {generatedRecord.label}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Copy the key now. It is not stored in plaintext and will not be shown again after this session.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyGeneratedKey}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 hover:bg-zinc-200 transition"
              >
                <Copy className="h-4 w-4" />
                Copy key
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeneratedKey(null);
                  setGeneratedRecord(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-transparent px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/50 p-4">
            <div className="text-sm font-mono text-zinc-50 break-all select-all">
              {generatedKey}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-start">
        {/* Create Key Section */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black tracking-tight text-zinc-950">Issue new key</h2>
            <p className="mt-1 text-sm text-zinc-500">Provide a label and map the necessary domain scopes.</p>
          </div>

          <form onSubmit={handleCreateKey} className="space-y-8">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                Integration Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Production automation pipeline"
                disabled={formLocked}
                className="w-full border-b border-zinc-200 bg-transparent py-3 text-lg font-medium text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                  Domain Scopes
                </label>
                <div className="flex gap-3 text-xs font-semibold">
                  <button type="button" onClick={selectAllScopes} className="text-zinc-500 hover:text-zinc-900">All</button>
                  <button type="button" onClick={clearScopes} className="text-zinc-500 hover:text-zinc-900">Clear</button>
                </div>
              </div>

              <div className="space-y-3">
                {groupedScopes.map((group) => (
                  <div key={group.group} className="rounded-2xl border border-zinc-200 bg-white p-1">
                    <div className="px-4 py-3 pb-1 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-950">{group.group}</span>
                      <span className="text-xs text-zinc-400 font-mono">
                        {selectedScopes.filter((scope) => API_KEY_SCOPE_DEFINITIONS.find((definition) => definition.scope === scope)?.group === group.group).length}
                        /{group.scopes.length}
                      </span>
                    </div>
                    <div>
                      {group.scopes.map((scope) => {
                        const checked = selectedScopes.includes(scope.scope);
                        return (
                          <label
                            key={scope.scope}
                            className={`flex cursor-pointer items-start gap-3 p-3 transition rounded-xl ${
                              checked ? 'bg-zinc-50' : 'hover:bg-zinc-50/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleScope(scope.scope)}
                              disabled={formLocked}
                              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                            />
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">{scope.title}</div>
                              <p className="mt-0.5 text-xs text-zinc-500">{scope.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={formLocked || !label.trim() || selectedScopes.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Generate API Key
            </button>
          </form>
        </div>

        {/* Existing Keys List */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-black tracking-tight text-zinc-950">Active authorizations</h2>
            <p className="mt-1 text-sm text-zinc-500">Manage pipeline revocation and usage bounds.</p>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="text-sm text-zinc-500 py-4">Scanning active vaults...</div>
            ) : sortedKeys.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 border-dashed p-8 text-center text-sm text-zinc-500">
                No active authorizations issued.
              </div>
            ) : (
              sortedKeys.map((key) => (
                <div key={key.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-zinc-950">{key.label}</h3>
                        <KeyStatusPill active={key.isActive} />
                      </div>
                      <div className="mt-2 text-xs font-mono text-zinc-500">
                        Prefix: <span className="text-zinc-900 font-semibold tracking-[0.24em]">••••{key.keyLast4}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevokeKey(key.id)}
                      disabled={!key.isActive || formLocked}
                      className="shrink-0 rounded-full border border-zinc-200 bg-white p-2 text-zinc-400 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 transition"
                      title="Revoke access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {key.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-600"
                      >
                        {scopeLabel(scope)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                    <div>Issued: {formatDate(key.createdAt)}</div>
                    <div>Used: {formatDate(key.lastUsedAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {error ? (
        <div className="fixed bottom-6 right-6 rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm font-semibold text-red-600 shadow-xl max-w-sm z-50 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="fixed bottom-6 right-6 rounded-2xl border border-zinc-900 bg-zinc-950 px-5 py-4 text-sm font-semibold text-white shadow-xl max-w-sm z-50 flex items-center gap-3">
          <Check className="h-5 w-5 shrink-0 text-emerald-400" />
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}

function KeyStatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.24em] ${
        active ? 'bg-zinc-950 text-zinc-50' : 'bg-zinc-100 text-zinc-400 line-through'
      }`}
    >
      {active ? 'Active' : 'Revoked'}
    </span>
  );
}
