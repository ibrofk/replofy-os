import React, { useEffect, useState } from 'react';
import { localAuthClient } from '../services/localAuthClient';
import { standaloneClient } from '../services/standaloneClient';
import logo from '../assets/logo-compact.png';

type InvitationPreview = Awaited<ReturnType<typeof standaloneClient.invitation>>;

export function StandaloneJoinPage({
  token,
  sessionUser,
  onSessionChanged,
}: {
  token: string;
  sessionUser?: { id: string; email: string } | null;
  onSessionChanged: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    standaloneClient.invitation(token)
      .then(setPreview)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Invitation is unavailable.'));
  }, [token]);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      if (sessionUser) {
        if (sessionUser.email.toLowerCase() !== preview.email.toLowerCase()) {
          throw new Error(`Sign out and use ${preview.email} to accept this invitation.`);
        }
      } else if (mode === 'existing') {
        const signedIn = await localAuthClient.signIn.email({ email: preview.email, password });
        if (signedIn.error) throw new Error(signedIn.error.message || 'Sign in failed.');
        await onSessionChanged();
      }

      const accepted = await standaloneClient.acceptInvitation(
        token,
        mode === 'new' && !sessionUser ? { name, password } : {},
      );
      if (!sessionUser && mode === 'new') {
        const signedIn = await localAuthClient.signIn.email({ email: preview.email, password });
        if (signedIn.error) throw new Error(signedIn.error.message || 'Account created, but sign in failed.');
        await onSessionChanged();
      }
      await standaloneClient.activateWorkspace(accepted.workspaceId);
      window.location.assign('/tasks');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invitation acceptance failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <form onSubmit={accept} className="w-full max-w-md rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
        <img src={logo} alt="Replofy OS" className="mx-auto mb-6 h-10 w-auto mix-blend-multiply" />
        <h1 className="text-center text-xl font-bold text-zinc-950">Join {preview?.workspaceName || 'workspace'}</h1>
        {preview && <p className="mt-2 text-center text-sm text-zinc-500">Invited as <span className="font-semibold">{preview.role}</span> using {preview.email}</p>}

        {!sessionUser && preview && (
          <>
            <div className="mt-6 flex rounded-xl bg-zinc-100 p-1">
              <button type="button" onClick={() => setMode('new')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'new' ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>New account</button>
              <button type="button" onClick={() => setMode('existing')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'existing' ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Existing account</button>
            </div>
            {mode === 'new' && (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Your name</span>
                <input required value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm" />
              </label>
            )}
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Password</span>
              <input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm" />
            </label>
          </>
        )}

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={!preview || submitting} className="mt-6 w-full rounded-full bg-zinc-950 px-6 py-3 font-semibold text-white disabled:opacity-60">
          {submitting ? 'Joining…' : 'Accept invitation'}
        </button>
      </form>
    </div>
  );
}
