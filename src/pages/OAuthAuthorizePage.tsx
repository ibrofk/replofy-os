import React, { useMemo, useState } from 'react';
import { Check, ShieldCheck, Sparkles, X } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup, type User } from 'firebase/auth';
import { auth } from '../firebase';
import type { UserProfile } from '../types';
import logo from '../assets/logo-compact.png';

type OAuthAuthorizePageProps = {
  user: User | null;
  userProfile: UserProfile | null;
  authError: string | null;
};

function getOAuthParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    response_type: params.get('response_type') || '',
    client_id: params.get('client_id') || '',
    redirect_uri: params.get('redirect_uri') || '',
    state: params.get('state') || '',
    scope: params.get('scope') || '',
    code_challenge: params.get('code_challenge') || '',
    code_challenge_method: params.get('code_challenge_method') || '',
    resource: params.get('resource') || '',
  };
}

function getSafeChatGptRedirect(redirectUri: string) {
  try {
    const redirect = new URL(redirectUri);
    const isChatGptConnector =
      redirect.origin === 'https://chatgpt.com' &&
      (redirect.pathname.startsWith('/connector/oauth/') ||
        redirect.pathname === '/connector_platform_oauth_redirect');

    return isChatGptConnector ? redirect : null;
  } catch {
    return null;
  }
}

function redirectWithError(redirectUri: string, state: string, error: string) {
  const redirect = getSafeChatGptRedirect(redirectUri);
  if (!redirect) return;

  redirect.searchParams.set('error', error);
  if (state) redirect.searchParams.set('state', state);
  window.location.assign(redirect.toString());
}

const CHATGPT_OAUTH_SCOPES = [
  'workspace:read',
  'workspace:write',
  'systems:read',
  'systems:write',
  'identity:read',
  'identity:write',
];

function getDisplayScopes(scope: string) {
  const requestedScopes = scope ? scope.split(/\s+/).filter(Boolean) : [];
  return Array.from(new Set([...requestedScopes, ...CHATGPT_OAUTH_SCOPES]));
}

export function OAuthAuthorizePage({ user, userProfile, authError }: OAuthAuthorizePageProps) {
  const params = useMemo(() => getOAuthParams(), []);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopes = getDisplayScopes(params.scope);
  const isReady = Boolean(user && userProfile && !authError);

  const signIn = async () => {
    setError(null);
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const authorize = async () => {
    if (!auth.currentUser) return;
    setIsAuthorizing(true);
    setError(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/oauth/authorize/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...params,
          scope: scopes.join(' '),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error_description || 'Unable to authorize ChatGPT.');
      }
      window.location.assign(payload.redirectTo);
    } catch (authorizeError) {
      setError(authorizeError instanceof Error ? authorizeError.message : 'Unable to authorize ChatGPT.');
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 text-zinc-900">
      <div className="w-full max-w-lg rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
        <img src={logo} alt="Replofy OS" className="mb-8 h-10 w-auto mix-blend-multiply" />

        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
          <Sparkles className="h-3.5 w-3.5" />
          ChatGPT connector
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-zinc-950">Authorize Replofy OS</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Allow ChatGPT to access Replofy OS using your workspace permissions.
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Signed in as</div>
          <div className="mt-2 text-sm font-bold text-zinc-950">{userProfile?.displayName || user?.displayName || 'Not signed in'}</div>
          <div className="mt-1 text-xs text-zinc-500">{userProfile?.email || user?.email || 'Sign in to continue'}</div>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-black text-zinc-950">
            <ShieldCheck className="h-4 w-4" />
            Requested scopes
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {scopes.map((scope) => (
              <span key={scope} className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
                {scope}
              </span>
            ))}
          </div>
        </div>

        {(error || authError) && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error || authError}
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => redirectWithError(params.redirect_uri, params.state, 'access_denied')}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>

          {!user ? (
            <button
              type="button"
              onClick={() => void signIn()}
              className="inline-flex items-center justify-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
            >
              Sign in with Google
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void authorize()}
              disabled={!isReady || isAuthorizing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {isAuthorizing ? 'Authorizing...' : 'Authorize'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
