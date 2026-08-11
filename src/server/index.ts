import 'dotenv/config';
import { createServer } from 'node:http';
import { createLocalAuth } from './auth.js';
import { createServerApp } from './app.js';
import { loadServerConfig } from './config.js';
import { createPostgresDatabase } from './db/client.js';
import { AIEngine } from './ai/engine.js';
import { AIJobRunner } from './ai/jobs.js';
import { BetterAuthProvider } from './platform/auth-provider.js';
import { FilesystemAssetStore } from './platform/filesystem-asset-store.js';
import { S3AssetStore } from './platform/s3-asset-store.js';
import { DrizzleWorkspaceRepository } from './platform/workspace-repository.js';

const config = loadServerConfig();
const { db, pool } = createPostgresDatabase(config.databaseUrl);
const auth = createLocalAuth(config, db);
const authProvider = new BetterAuthProvider(auth);
const workspaceRepository = new DrizzleWorkspaceRepository(db);
const aiEngine = new AIEngine(workspaceRepository, config);
const aiWorker = config.aiWorkerEnabled === false
  ? null
  : new AIJobRunner(
      workspaceRepository,
      config,
      aiEngine,
      (userId, workspaceId) => workspaceRepository.resolveWorkspaceActor(userId, workspaceId),
    );
const assetStore = config.assetStore === 's3' && config.s3
  ? new S3AssetStore(config.s3)
  : new FilesystemAssetStore(config.dataDirectory);
const app = createServerApp({ config, authProvider, workspaceRepository, assetStore });
const server = createServer(app);

aiWorker?.start();

let stopping = false;

async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[replofy-os] received ${signal}; shutting down`);

  server.close(async () => {
    aiWorker?.stop();
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));

server.listen(config.port, config.host, () => {
  console.log(`[replofy-os] standalone server listening at ${config.appUrl}`);
});
