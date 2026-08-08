import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { useGlobalState } from '../contexts/GlobalStateContext';
import { useUser } from '../contexts/UserContext';
import {
  standaloneClient,
  type StandaloneApiKey,
  type StandaloneInvitation,
} from '../services/standaloneClient';
import { StudioHeader } from '../components/ui/StudioHeader';

export function StandaloneTeamPage() {
  const { teamMembers } = useGlobalState();
  const { userProfile } = useUser();
  const [invitations, setInvitations] = useState<StandaloneInvitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<StandaloneApiKey[]>([]);
  const [keyLabel, setKeyLabel] = useState('Replofy MCP');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canInvite = userProfile?.role === 'master-admin' || userProfile?.role === 'admin';

  useEffect(() => {
    if (!canInvite) return;
    Promise.all([standaloneClient.listInvitations(), standaloneClient.listApiKeys()])
      .then(([invitationResult, keyResult]) => {
        setInvitations(invitationResult.data);
        setApiKeys(keyResult.data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Failed to load invitations.'));
  }, [canInvite, userProfile?.companyId]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setCreatedLink(null);
    setError(null);
    try {
      const created = await standaloneClient.createInvitation({ email, role });
      setCreatedLink(created.acceptUrl || null);
      setInvitations((current) => [created, ...current]);
      setEmail('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invitation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const createApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setCreatedKey(null);
    setError(null);
    try {
      const created = await standaloneClient.createApiKey({
        label: keyLabel,
        scopes: [
          'workspace:read',
          'workspace:write',
          'execution:read',
          'execution:write',
          'members:read',
          'chat:read',
          'chat:write',
          'content:read',
          'content:write',
          'operators:read',
          'operators:write',
          'creative:read',
          'creative:write',
          'growth:read',
          'growth:write',
          'technical:read',
          'technical:write',
          'systems:read',
          'systems:write',
        ],
      });
      const { key: disclosedKey, ...metadata } = created;
      setCreatedKey(disclosedKey || null);
      setApiKeys((current) => [metadata, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'API key creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    setError(null);
    try {
      await standaloneClient.revokeApiKey(keyId);
      setApiKeys((current) => current.map((key) => (
        key.id === keyId ? { ...key, revokedAt: new Date().toISOString() } : key
      )));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'API key revocation failed.');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50">
      <StudioHeader
        showNotifications={false}
        badge="Workspace"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="Team"
        subtitle="Memberships are workspace-scoped; invitation links are shown only once."
      />
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">Members</h2>
            <div className="mt-4 divide-y divide-zinc-100">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900">{member.displayName}</p>
                    <p className="truncate text-sm text-zinc-500">{member.email}</p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold capitalize text-zinc-600">
                    {member.role === 'master-admin' ? 'owner' : member.role}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            {canInvite && (
              <form onSubmit={invite} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h2 className="font-bold text-zinc-950">Invite a teammate</h2>
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Email</span>
                  <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-500" />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Role</span>
                  <select value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'member')} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">
                    <option value="member">Member</option>
                    {userProfile?.role === 'master-admin' && <option value="admin">Admin</option>}
                  </select>
                </label>
                <button type="submit" disabled={submitting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create invitation
                </button>
              </form>
            )}

            {createdLink && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-sm font-semibold text-emerald-900">Copy this link now</p>
                <p className="mt-1 text-xs text-emerald-700">Only its hash is stored, so it cannot be displayed again.</p>
                <textarea readOnly value={createdLink} className="mt-3 h-24 w-full resize-none rounded-xl border border-emerald-200 bg-white p-3 text-xs text-zinc-700" />
                <button type="button" onClick={() => void navigator.clipboard.writeText(createdLink)} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <Copy className="h-4 w-4" /> Copy link
                </button>
              </div>
            )}

            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            {canInvite && invitations.length > 0 && (
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">Invitations</h2>
                <div className="mt-3 space-y-3">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">{invitation.email}</span>
                        <span className="text-xs capitalize text-zinc-500">{invitation.status}</span>
                      </div>
                      <p className="mt-0.5 text-xs capitalize text-zinc-400">{invitation.role}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {canInvite && (
              <section className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">API keys</h2>
                </div>
                <p className="mt-2 text-xs text-zinc-500">Scoped keys connect the standalone MCP to this workspace.</p>
                <form onSubmit={createApiKey} className="mt-4 flex gap-2">
                  <input required minLength={3} value={keyLabel} onChange={(event) => setKeyLabel(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm" aria-label="API key label" />
                  <button type="submit" disabled={submitting} className="rounded-xl bg-zinc-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Create</button>
                </form>
                {createdKey && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">Copy this key now. It cannot be recovered.</p>
                    <textarea readOnly value={createdKey} className="mt-2 h-20 w-full resize-none rounded-lg border border-amber-200 bg-white p-2 font-mono text-xs" />
                    <button type="button" onClick={() => void navigator.clipboard.writeText(createdKey)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <Copy className="h-3.5 w-3.5" /> Copy key
                    </button>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  {apiKeys.map((key) => (
                    <div key={key.id} className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{key.label}</p>
                        <p className="font-mono text-xs text-zinc-400">{key.prefix}… · {key.revokedAt ? 'revoked' : 'active'}</p>
                      </div>
                      {!key.revokedAt && (
                        <button type="button" onClick={() => void revokeApiKey(key.id)} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-700" aria-label={`Revoke ${key.label}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
