import type { ServerConfig } from '../config.js';
import type { SourceReference } from './types.js';

export type MemoryProjectionRecord = {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  sourceReferences: SourceReference[];
  edges?: Array<{ type: string; targetId: string }>;
};

export class MemoryProjectionError extends Error {
  constructor(message: string, readonly statusCode = 503) {
    super(message);
    this.name = 'MemoryProjectionError';
  }
}

export class MemoryProjectionClient {
  constructor(private readonly config: ServerConfig) {}

  get enabled() {
    return Boolean(this.config.memoryServiceUrl);
  }

  async health() {
    if (!this.enabled) return false;
    try {
      const result = await this.request<{ ok?: boolean }>('/health');
      return result.ok === true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    if (!this.config.memoryServiceUrl) throw new MemoryProjectionError('Memory sidecar is not configured.');
    const response = await fetch(`${this.config.memoryServiceUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.memoryServiceToken ? { Authorization: `Bearer ${this.config.memoryServiceToken}` } : {}),
        ...(init.headers || {}),
      },
    });
    if (!response.ok) throw new MemoryProjectionError(`Memory sidecar returned ${response.status}.`, response.status);
    return response.json() as Promise<T>;
  }

  async upsert(workspaceId: string, records: MemoryProjectionRecord[]) {
    return this.request<{ ok: true; count: number }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/records:upsert`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    });
  }

  async search(workspaceId: string, query: string, limit = 20) {
    return this.request<{ data: Array<MemoryProjectionRecord & { score?: number }> }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/search`, {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    });
  }

  async removeSource(workspaceId: string, sourceVersionId: string) {
    return this.request<{ ok: true }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/sources/${encodeURIComponent(sourceVersionId)}`, {
      method: 'DELETE',
    });
  }

  async removeRecord(workspaceId: string, recordId: string) {
    return this.request<{ ok: true }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/records/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
    });
  }

  async reindex(workspaceId: string, records: MemoryProjectionRecord[] = []) {
    return this.request<{ ok: true }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/reindex`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    });
  }
}
