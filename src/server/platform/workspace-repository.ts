import type { PostgresDatabase } from '../db/client.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import {
  activateWorkspace,
  createWorkspace,
  listUserWorkspaces,
  resolveWorkspaceActor,
} from '../workspaces.js';

export type WorkspaceList = Awaited<ReturnType<typeof listUserWorkspaces>>;
export type WorkspaceSummary = Awaited<ReturnType<typeof createWorkspace>>;
export type WorkspaceActivation = Awaited<ReturnType<typeof activateWorkspace>>;

/** The Drizzle capabilities used by workspace-scoped application services. */
export interface WorkspaceRepository extends Pick<
  PostgresDatabase,
  'select' | 'insert' | 'update' | 'delete' | 'transaction' | 'execute'
> {}

/**
 * Workspace identity is an application boundary, not a route-level SQL detail.
 * The first adapter delegates to Drizzle; other persistence providers can
 * implement this contract without changing authentication or browser routes.
 */
export interface WorkspaceIdentityRepository extends WorkspaceRepository {
  listUserWorkspaces(userId: string): Promise<WorkspaceList>;
  createWorkspace(userId: string, input: unknown): Promise<WorkspaceSummary>;
  activateWorkspace(userId: string, sessionId: string, workspaceId: string): Promise<WorkspaceActivation>;
  resolveWorkspaceActor(userId: string, activeWorkspaceId: string | null | undefined): Promise<WorkspaceActor>;
}

export class DrizzleWorkspaceRepository implements WorkspaceIdentityRepository {
  readonly select: PostgresDatabase['select'];
  readonly insert: PostgresDatabase['insert'];
  readonly update: PostgresDatabase['update'];
  readonly delete: PostgresDatabase['delete'];
  readonly transaction: PostgresDatabase['transaction'];
  readonly execute: PostgresDatabase['execute'];

  constructor(database: PostgresDatabase) {
    this.select = database.select.bind(database) as PostgresDatabase['select'];
    this.insert = database.insert.bind(database) as PostgresDatabase['insert'];
    this.update = database.update.bind(database) as PostgresDatabase['update'];
    this.delete = database.delete.bind(database) as PostgresDatabase['delete'];
    this.transaction = database.transaction.bind(database) as PostgresDatabase['transaction'];
    this.execute = database.execute.bind(database) as PostgresDatabase['execute'];
  }

  listUserWorkspaces(userId: string) {
    return listUserWorkspaces(this, userId);
  }

  createWorkspace(userId: string, input: unknown) {
    return createWorkspace(this, userId, input);
  }

  activateWorkspace(userId: string, sessionId: string, workspaceId: string) {
    return activateWorkspace(this, userId, sessionId, workspaceId);
  }

  resolveWorkspaceActor(userId: string, activeWorkspaceId: string | null | undefined) {
    return resolveWorkspaceActor(this, userId, activeWorkspaceId);
  }
}
