import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import type { Request } from 'express';
import type { LocalAuth } from '../auth.js';

export type StandaloneAuthSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  session: {
    id: string;
    activeWorkspaceId?: string | null;
  };
};

export interface AuthProvider {
  readonly handler: ReturnType<typeof toNodeHandler>;
  getSession(request: Pick<Request, 'headers'>): Promise<StandaloneAuthSession | null>;
}

export class BetterAuthProvider implements AuthProvider {
  readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(private readonly auth: LocalAuth) {
    this.handler = toNodeHandler(auth);
  }

  async getSession(request: Pick<Request, 'headers'>) {
    return this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    }) as Promise<StandaloneAuthSession | null>;
  }
}
