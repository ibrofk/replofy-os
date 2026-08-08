import React, { useEffect, useState } from 'react';
import { Code2, Database, GitBranch, Plus, RefreshCw, Rocket, RotateCcw, Trash2 } from 'lucide-react';
import { StudioHeader } from '../components/ui/StudioHeader';
import {
  standaloneClient,
  type StandaloneEnvironmentDeployment,
} from '../services/standaloneClient';
import type { ApiEndpoint, EnvironmentState } from '../types';

const environmentNames: EnvironmentState['name'][] = ['Local', 'Staging', 'Production'];

function statusClass(status: EnvironmentState['status']) {
  if (status === 'healthy') return 'bg-emerald-100 text-emerald-700';
  if (status === 'deploying') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export function StandaloneSystemsPage() {
  const [environments, setEnvironments] = useState<EnvironmentState[]>([]);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [deployments, setDeployments] = useState<StandaloneEnvironmentDeployment[]>([]);
  const [environmentName, setEnvironmentName] = useState<EnvironmentState['name']>('Local');
  const [environmentVersion, setEnvironmentVersion] = useState('v0.0.0');
  const [endpointMethod, setEndpointMethod] = useState<ApiEndpoint['method']>('GET');
  const [endpointPath, setEndpointPath] = useState('/api/v1/health');
  const [endpointDescription, setEndpointDescription] = useState('');
  const [deployVersions, setDeployVersions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [environmentResult, endpointResult, deploymentResult] = await Promise.all([
        standaloneClient.listEnvironments(),
        standaloneClient.listApiEndpoints(),
        standaloneClient.listEnvironmentDeployments(),
      ]);
      setEnvironments(environmentResult.data);
      setEndpoints(endpointResult.data);
      setDeployments(deploymentResult.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load Systems.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createEnvironment = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await standaloneClient.createEnvironment({ name: environmentName, version: environmentVersion });
      setEnvironments((current) => [...current, created]);
      setEnvironmentVersion('v0.0.0');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Environment creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const createEndpoint = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await standaloneClient.createApiEndpoint({
        method: endpointMethod,
        path: endpointPath,
        description: endpointDescription,
      });
      setEndpoints((current) => [created, ...current]);
      setEndpointDescription('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Endpoint creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const deploy = async (environment: EnvironmentState) => {
    const version = deployVersions[environment.id]?.trim();
    if (!version) {
      setError('Enter a version before deploying.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await standaloneClient.deployEnvironment(environment.id, { version });
      setEnvironments((current) => current.map((item) => item.id === result.environment.id ? result.environment : item));
      setDeployments((current) => [result.deployment, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Deployment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const rollback = async (environment: EnvironmentState) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await standaloneClient.rollbackEnvironment(environment.id);
      setEnvironments((current) => current.map((item) => item.id === result.environment.id ? result.environment : item));
      setDeployments((current) => [result.deployment, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rollback failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeEndpoint = async (endpoint: ApiEndpoint) => {
    setSubmitting(true);
    setError(null);
    try {
      await standaloneClient.deleteApiEndpoint(endpoint.id);
      setEndpoints((current) => current.filter((item) => item.id !== endpoint.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Endpoint deletion failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader
        showNotifications={false}
        badge="Systems & telemetry"
        badgeIcon={<Database className="h-3.5 w-3.5" />}
        title="Systems"
        subtitle="Workspace-scoped environments, endpoint inventory, and auditable release history."
        actions={(
          <button onClick={() => void load()} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-950" aria-label="Refresh Systems">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      />
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {loading ? (
            <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Loading Systems…</p>
          ) : (
            <>
              <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Runtime environments</p>
                      <p className="mt-1 text-sm text-zinc-500">Deployments update a local, auditable state record; connect your own runner through the API.</p>
                    </div>
                    <GitBranch className="h-5 w-5 text-zinc-400" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {environments.map((environment) => (
                      <div key={environment.id} className="rounded-xl border border-zinc-200 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-zinc-950">{environment.name}</h3>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusClass(environment.status)}`}>
                            {environment.status}
                          </span>
                        </div>
                        <p className="mt-3 font-mono text-sm text-zinc-700">{environment.version}</p>
                        <p className="mt-1 text-xs text-zinc-500">Synced {new Date(environment.lastSync).toLocaleString()}</p>
                        <div className="mt-4 flex gap-2">
                          <input
                            value={deployVersions[environment.id] ?? ''}
                            onChange={(event) => setDeployVersions((current) => ({ ...current, [environment.id]: event.target.value }))}
                            placeholder="v1.2.3"
                            className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-2 font-mono text-xs outline-none focus:border-zinc-500"
                          />
                          <button disabled={submitting} onClick={() => void deploy(environment)} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" title="Deploy">
                            <Rocket className="h-3.5 w-3.5" />
                          </button>
                          <button disabled={submitting} onClick={() => void rollback(environment)} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-50" title="Rollback">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {environments.length === 0 && <p className="text-sm text-zinc-500 md:col-span-3">No environments configured yet.</p>}
                  </div>
                </div>
                <form onSubmit={createEnvironment} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Add environment</p>
                  <div className="mt-4 space-y-3">
                    <select value={environmentName} onChange={(event) => setEnvironmentName(event.target.value as EnvironmentState['name'])} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                      {environmentNames.map((name) => <option key={name}>{name}</option>)}
                    </select>
                    <input value={environmentVersion} onChange={(event) => setEnvironmentVersion(event.target.value)} placeholder="Initial version" className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-500" />
                    <button disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                      <Plus className="h-4 w-4" /> Add environment
                    </button>
                  </div>
                </form>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">API endpoint inventory</p>
                      <p className="mt-1 text-sm text-zinc-500">Keep the self-hosted API contract discoverable for operators and integrations.</p>
                    </div>
                    <Code2 className="h-5 w-5 text-zinc-400" />
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="border-b border-zinc-100 text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="pb-2">Method</th><th className="pb-2">Path</th><th className="pb-2">Description</th><th className="pb-2">Status</th><th className="pb-2" /></tr></thead>
                      <tbody className="divide-y divide-zinc-100">
                        {endpoints.map((endpoint) => (
                          <tr key={endpoint.id}><td className="py-3 font-mono text-xs">{endpoint.method}</td><td className="py-3 font-mono text-xs text-zinc-700">{endpoint.path}</td><td className="py-3 text-zinc-600">{endpoint.description}</td><td className="py-3 text-xs text-zinc-500">{endpoint.status}</td><td className="py-3 text-right"><button disabled={submitting} onClick={() => void removeEndpoint(endpoint)} className="text-zinc-400 hover:text-red-600 disabled:opacity-50" aria-label={`Delete ${endpoint.path}`}><Trash2 className="h-4 w-4" /></button></td></tr>
                        ))}
                        {endpoints.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-zinc-500">No endpoints recorded.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <form onSubmit={createEndpoint} className="rounded-2xl border border-zinc-200 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Register endpoint</p>
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                      <select value={endpointMethod} onChange={(event) => setEndpointMethod(event.target.value as ApiEndpoint['method'])} className="rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
                      <input required value={endpointPath} onChange={(event) => setEndpointPath(event.target.value)} placeholder="/api/v1/resource" className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-500" />
                    </div>
                    <textarea required value={endpointDescription} onChange={(event) => setEndpointDescription(event.target.value)} placeholder="What this endpoint does" rows={3} className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-500" />
                    <button disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Register endpoint</button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Deployment history</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-zinc-100 text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="pb-2">Action</th><th className="pb-2">Version</th><th className="pb-2">Previous</th><th className="pb-2">Environment</th><th className="pb-2">When</th></tr></thead><tbody className="divide-y divide-zinc-100">{deployments.map((deployment) => <tr key={deployment.id}><td className="py-3 capitalize">{deployment.action}</td><td className="py-3 font-mono text-xs">{deployment.version}</td><td className="py-3 font-mono text-xs text-zinc-500">{deployment.previousVersion ?? '—'}</td><td className="py-3 text-zinc-600">{environments.find((item) => item.id === deployment.environmentId)?.name ?? deployment.environmentId.slice(0, 8)}</td><td className="py-3 text-xs text-zinc-500">{new Date(deployment.createdAt).toLocaleString()}</td></tr>)}{deployments.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-zinc-500">No deployment history yet.</td></tr>}</tbody></table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
