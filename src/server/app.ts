import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import type { ServerConfig } from './config.js';
import { BootstrapError, bootstrapInstance, needsBootstrap } from './bootstrap.js';
import { WorkspaceError } from './workspaces.js';
import type { AIProvider } from './platform/ai-provider.js';
import { GeminiAIProvider } from './platform/gemini-ai-provider.js';
import type { AuthProvider } from './platform/auth-provider.js';
import type { WorkspaceIdentityRepository } from './platform/workspace-repository.js';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  TaskError,
  updateTask,
} from './execution/tasks.js';
import {
  createCycleGoal,
  CycleGoalError,
  deleteCycleGoal,
  getCycleGoal,
  listCycleGoals,
  updateCycleGoal,
} from './execution/cycle-goals.js';
import {
  createVision,
  deleteVision,
  getVision,
  listVisions,
  updateVision,
  VisionError,
} from './execution/visions.js';
import { createFocusStack, FocusStackError } from './execution/focus-stack.js';
import { ReportError, buildWeeklyChangelog, startNextCycle } from './execution/reports.js';
import {
  InMemoryWorkspaceEventBus,
  type WorkspaceEventBus,
} from './platform/event-bus.js';
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  getWorkspaceInvitation,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  MemberError,
} from './members.js';
import {
  authorizeStandaloneApiKey,
  createStandaloneApiKey,
  listStandaloneApiKeys,
  revokeStandaloneApiKey,
  StandaloneApiKeyError,
  type StandaloneApiKeyScope,
} from './api-keys.js';
import {
  addTeamChatParticipantToChannel,
  createTeamChatChannel,
  createTeamChatMessage,
  createTeamChatParticipant,
  deleteTeamChatChannel,
  deleteTeamChatMessage,
  deleteTeamChatParticipant,
  getTeamChatChannel,
  getTeamChatMessage,
  getTeamChatParticipant,
  listTeamChatChannels,
  listTeamChatMessages,
  listTeamChatParticipants,
  TeamChatError,
  updateTeamChatChannel,
  updateTeamChatParticipant,
} from './team-chat.js';
import {
  ContentError,
  createBlogArticle,
  deleteBlogArticle,
  getBlogArticle,
  listBlogArticles,
  updateBlogArticle,
} from './content.js';
import {
  claimOperatorWorkOrder,
  createOperatorDesk,
  createOperatorWorkOrder,
  deleteOperatorDesk,
  deleteOperatorWorkOrder,
  getOperatorDesk,
  getOperatorWorkOrder,
  listAvailableOperatorWorkOrders,
  listOperatorDesks,
  listOperatorWorkOrders,
  OperatorError,
  releaseOperatorWorkOrder,
  updateOperatorDesk,
  updateOperatorWorkOrder,
} from './operators.js';
import {
  approveOperatorApproval,
  buildOperatorManifest,
  createOperatorContextPack,
  createOperatorMemory,
  deleteOperatorCheckin,
  deleteOperatorContextPack,
  deleteOperatorMemory,
  deleteOperatorOutput,
  getOperatorApproval,
  getOperatorCheckin,
  getOperatorContextPack,
  getOperatorInjection,
  getOperatorMemory,
  getOperatorOutput,
  listOperatorApprovals,
  listOperatorCheckins,
  listOperatorContextPacks,
  listOperatorInjections,
  listOperatorMemories,
  listOperatorOutputs,
  OperatorRuntimeError,
  rejectOperatorApproval,
  submitOperatorCheckin,
  submitOperatorOutput,
  transitionOperatorMemory,
  updateOperatorMemory,
} from './operator-runtime.js';
import {
  createCreativeItem,
  CreativeError,
  deleteCreativeItem,
  getCreativeAsset,
  getCreativeAssetDownload,
  getCreativeItem,
  listCreativeAssets,
  listCreativeItems,
  updateCreativeAsset,
  updateCreativeItem,
  uploadCreativeAsset,
} from './creative.js';
import type { AssetStore } from './platform/asset-store.js';
import {
  createAccount,
  createLead,
  deleteAccount,
  deleteLead,
  getAccount,
  getLead,
  GrowthError,
  listAccounts,
  listLeads,
  updateAccount,
  updateLead,
} from './growth.js';
import {
  createBug,
  createRoadmapItem,
  deleteBug,
  deleteRoadmapItem,
  getBug,
  getRoadmapItem,
  listBugs,
  listRoadmapItems,
  TechnicalError,
  updateBug,
  updateRoadmapItem,
} from './technical.js';
import {
  createApiEndpoint,
  createEnvironment,
  deleteApiEndpoint,
  deleteEnvironment,
  deployEnvironment,
  getApiEndpoint,
  getEnvironment,
  listApiEndpoints,
  listEnvironmentDeployments,
  listEnvironments,
  rollbackEnvironment,
  SystemsError,
  updateApiEndpoint,
  updateEnvironment,
} from './systems.js';
import {
  BusinessPlanError,
  createBusinessPlan,
  deleteBusinessPlan,
  getBusinessPlan,
  listBusinessPlanSessions,
  listBusinessPlans,
  updateBusinessPlan,
  updateBusinessPlanSession,
  upsertBusinessPlanSession,
  deleteBusinessPlanSession,
} from './business-plans.js';
import {
  ContextError,
  createContextSourceFolder,
  deleteContextSource,
  deleteContextSourceFolder,
  deleteContextSourceItem,
  deleteContextSourceVersion,
  extractContextPayload,
  getContextSourceFolder,
  getContextSourceItem,
  getContextSource,
  getContextSourceVersion,
  ingestContext,
  listContextSourceFolders,
  listAllContextSourceVersions,
  listContextSourceItems,
  listContextSources,
  listContextSourceVersions,
  updateContextSource,
  updateContextSourceFolder,
  updateContextSourceItem,
} from './context.js';
import {
  createFeedback,
  createPrompt,
  createSeoKeyword,
  createSocialPost,
  createTimeBlock,
  createWeekMarker,
  deleteFeedback,
  deletePrompt,
  deleteSeoKeyword,
  deleteSocialPost,
  deleteTimeBlock,
  deleteWeekMarker,
  getFeedback,
  getPrompt,
  getSeoKeyword,
  getSocialPost,
  getTimeBlock,
  getWeekMarker,
  listFeedback,
  listPrompts,
  listSeoKeywords,
  listSocialPosts,
  listTimeBlocks,
  listWeekMarkers,
  listChatReadStates,
  getNotificationReadState,
  updateFeedback,
  updatePrompt,
  updateSeoKeyword,
  updateSocialPost,
  updateTimeBlock,
  updateWeekMarker,
  upsertChatReadState,
  upsertNotificationReadState,
  StrategyError,
} from './strategy.js';
import { OPERATOR_MCP_REGISTRY_ACTIONS } from '../utils/operatorDeskTemplates.js';
import { workspace } from './db/schema.js';

export type ServerDependencies = {
  config: ServerConfig;
  authProvider: AuthProvider;
  workspaceRepository: WorkspaceIdentityRepository;
  assetStore: AssetStore;
  aiProvider?: AIProvider;
  eventBus?: WorkspaceEventBus;
};

export function createServerApp({
  config,
  authProvider,
  workspaceRepository,
  assetStore,
  aiProvider = new GeminiAIProvider(),
  eventBus,
}: ServerDependencies) {
  const database = workspaceRepository;
  const app = express();
  const workspaceEvents = eventBus || new InMemoryWorkspaceEventBus();
  app.disable('x-powered-by');

  app.get('/health/live', (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.get('/health/ready', async (_request, response) => {
    try {
      await database.execute(sql`select 1`);
      response.status(200).json({ ok: true, database: 'ready' });
    } catch {
      response.status(503).json({ ok: false, database: 'unavailable' });
    }
  });

  app.all('/api/auth/*', authProvider.handler);
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/setup/status', async (_request, response, next) => {
    try {
      response.status(200).json({ needsBootstrap: await needsBootstrap(database) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/setup/bootstrap', async (request, response, next) => {
    try {
      const result = await bootstrapInstance(database, config, request.body);
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  async function getRequestSession(request: express.Request) {
    const result = await authProvider.getSession(request);
    if (!result) throw new WorkspaceError('Authentication required.', 401);
    return result;
  }

  app.get('/api/invitations/:token', async (request, response, next) => {
    try {
      response.status(200).json(
        await getWorkspaceInvitation(database, request.params.token),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/invitations/:token/accept', async (request, response, next) => {
    try {
      const current = await authProvider.getSession(request);
      response.status(200).json(
        await acceptWorkspaceInvitation(
          database,
          request.params.token,
          request.body,
          current ? { id: current.user.id, email: current.user.email } : null,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/workspaces', async (request, response, next) => {
    try {
      const current = await getRequestSession(request);
      response.status(200).json({
        activeWorkspaceId: current.session.activeWorkspaceId ?? null,
        workspaces: await workspaceRepository.listUserWorkspaces(current.user.id),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/workspaces', async (request, response, next) => {
    try {
      const current = await getRequestSession(request);
      const created = await workspaceRepository.createWorkspace(current.user.id, request.body);
      response.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/workspaces/:workspaceId/activate', async (request, response, next) => {
    try {
      const current = await getRequestSession(request);
      const result = await workspaceRepository.activateWorkspace(
        current.user.id,
        current.session.id,
        request.params.workspaceId,
      );
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  async function getSessionWorkspaceActor(request: express.Request) {
    const current = await getRequestSession(request);
    return workspaceRepository.resolveWorkspaceActor(
      current.user.id,
      current.session.activeWorkspaceId,
    );
  }

  function assertApiKeyManagementIsUiOnly(request: express.Request) {
    if (request.header('x-api-key') || request.header('authorization')?.match(/^Bearer\s+/i)) {
      throw new StandaloneApiKeyError('API key management is available only from the authenticated settings UI.', 403);
    }
  }

  async function getWorkspaceActor(
    request: express.Request,
    requiredScope: StandaloneApiKeyScope,
  ) {
    const current = await authProvider.getSession(request);
    if (current) {
      // Browser sessions are bounded by active workspace membership. API-key
      // scopes apply only to bearer-key callers; admin-only services enforce
      // the session actor's workspace role separately.
      return workspaceRepository.resolveWorkspaceActor(
        current.user.id,
        current.session.activeWorkspaceId,
      );
    }
    const authorization = request.header('authorization');
    const rawKey = request.header('x-api-key')
      || authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!rawKey) throw new StandaloneApiKeyError('Authentication required.', 401);
    return authorizeStandaloneApiKey(database, rawKey, requiredScope);
  }

  app.get('/api/v1', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:read');
      response.status(200).json({
        name: 'Replofy OS Standalone API',
        version: 'v1',
        workspaceId: actor.workspaceId,
        resources: [
          'tasks',
          'cycle-goals',
          'visions',
          'prompts',
          'social-posts',
          'seo-keywords',
          'feedbacks',
          'time-blocks',
          'week-markers',
          'members',
          'team-chat-channels',
          'team-chat-participants',
          'team-chat-messages',
          'blog-articles',
          'business-plans',
          'creative-items',
          'creative-assets',
          'accounts',
          'leads',
          'bugs',
          'roadmap-items',
          'api-endpoints',
          'environments',
          'environment-deployments',
          'context-sources',
          'context-source-versions',
          'context-source-items',
          'context-source-folders',
          'operator-desks',
          'operator-work-orders',
          'operator-context-packs',
          'operator-checkins',
          'operator-outputs',
          'operator-injections',
          'operator-approvals',
          'operator-memories',
          'mcp-registry',
          'weekly-changelog',
        ],
        capabilities: {
          authentication: ['session', 'api-key'],
          realtime: 'server-sent-events',
          unsupportedResourcesReturn: 404,
          actions: {
            createFocusStack: '/api/v1/focus-stacks',
            startNextCycle: '/api/v1/cycles/start-next',
            weeklyChangelog: '/api/v1/reports/changelog?week=current|last',
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/creative-items', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listCreativeItems(database, await getWorkspaceActor(request, 'creative:read')),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/mcp-registry', async (request, response, next) => {
    try {
      await getWorkspaceActor(request, 'operators:read');
      response.status(200).json({ data: OPERATOR_MCP_REGISTRY_ACTIONS, count: OPERATOR_MCP_REGISTRY_ACTIONS.length });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/operator-mcp-registry', async (request, response, next) => {
    try {
      await getWorkspaceActor(request, 'operators:read');
      response.status(200).json({ data: OPERATOR_MCP_REGISTRY_ACTIONS, count: OPERATOR_MCP_REGISTRY_ACTIONS.length });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/accounts', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listAccounts(database, await getWorkspaceActor(request, 'growth:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });

  for (const route of [
    {
      resource: 'bugs',
      list: listBugs,
      get: getBug,
      create: createBug,
      update: updateBug,
      remove: deleteBug,
    },
    {
      resource: 'roadmap-items',
      list: listRoadmapItems,
      get: getRoadmapItem,
      create: createRoadmapItem,
      update: updateRoadmapItem,
      remove: deleteRoadmapItem,
    },
  ] as const) {
    app.get(`/api/v1/${route.resource}`, async (request, response, next) => {
      try {
        response.status(200).json({
          data: await route.list(database, await getWorkspaceActor(request, 'technical:read'), request.query),
        });
      } catch (error) {
        next(error);
      }
    });
    app.get(`/api/v1/${route.resource}/:recordId`, async (request, response, next) => {
      try {
        response.status(200).json(
          await route.get(database, await getWorkspaceActor(request, 'technical:read'), request.params.recordId),
        );
      } catch (error) {
        next(error);
      }
    });
    app.post(`/api/v1/${route.resource}`, async (request, response, next) => {
      try {
        response.status(201).json(
          await route.create(database, await getWorkspaceActor(request, 'technical:write'), request.body),
        );
      } catch (error) {
        next(error);
      }
    });
    app.patch(`/api/v1/${route.resource}/:recordId`, async (request, response, next) => {
      try {
        response.status(200).json(await route.update(
          database,
          await getWorkspaceActor(request, 'technical:write'),
          request.params.recordId,
          request.body,
        ));
      } catch (error) {
        next(error);
      }
    });
    app.delete(`/api/v1/${route.resource}/:recordId`, async (request, response, next) => {
      try {
        response.status(200).json(
          await route.remove(database, await getWorkspaceActor(request, 'technical:write'), request.params.recordId),
        );
      } catch (error) {
        next(error);
      }
    });
  }

  for (const route of [
    { resource: 'prompts', list: listPrompts, get: getPrompt, create: createPrompt, update: updatePrompt, remove: deletePrompt },
    { resource: 'social-posts', list: listSocialPosts, get: getSocialPost, create: createSocialPost, update: updateSocialPost, remove: deleteSocialPost },
    { resource: 'seo-keywords', list: listSeoKeywords, get: getSeoKeyword, create: createSeoKeyword, update: updateSeoKeyword, remove: deleteSeoKeyword },
    { resource: 'feedbacks', list: listFeedback, get: getFeedback, create: createFeedback, update: updateFeedback, remove: deleteFeedback },
    { resource: 'time-blocks', list: listTimeBlocks, get: getTimeBlock, create: createTimeBlock, update: updateTimeBlock, remove: deleteTimeBlock },
    { resource: 'week-markers', list: listWeekMarkers, get: getWeekMarker, create: createWeekMarker, update: updateWeekMarker, remove: deleteWeekMarker },
  ] as const) {
    app.get(`/api/v1/${route.resource}`, async (request, response, next) => {
      try {
        response.status(200).json({
          data: await route.list(database, await getWorkspaceActor(request, 'workspace:read'), request.query),
        });
      } catch (error) {
        next(error);
      }
    });
    app.get(`/api/v1/${route.resource}/:recordId`, async (request, response, next) => {
      try {
        response.status(200).json(
          await route.get(database, await getWorkspaceActor(request, 'workspace:read'), request.params.recordId),
        );
      } catch (error) {
        next(error);
      }
    });
    app.post(`/api/v1/${route.resource}`, async (request, response, next) => {
      try {
        response.status(201).json(
          await route.create(database, await getWorkspaceActor(request, 'workspace:write'), request.body),
        );
      } catch (error) {
        next(error);
      }
    });
    app.patch(`/api/v1/${route.resource}/:recordId`, async (request, response, next) => {
      try {
        response.status(200).json(await route.update(
          database,
          await getWorkspaceActor(request, 'workspace:write'),
          request.params.recordId,
          request.body,
        ));
      } catch (error) {
        next(error);
      }
    });
    app.delete(`/api/v1/${route.resource}/:recordId`, async (request, response, next) => {
      try {
        response.status(200).json(
          await route.remove(database, await getWorkspaceActor(request, 'workspace:write'), request.params.recordId),
        );
      } catch (error) {
        next(error);
      }
    });
  }

  app.get('/api/v1/chat-read-states', async (request, response, next) => {
    try {
      response.status(200).json({ data: await listChatReadStates(database, await getWorkspaceActor(request, 'chat:read')) });
    } catch (error) {
      next(error);
    }
  });
  app.put('/api/v1/chat-read-states', async (request, response, next) => {
    try {
      response.status(200).json(await upsertChatReadState(database, await getWorkspaceActor(request, 'chat:write'), request.body));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/notification-read-state', async (request, response, next) => {
    try {
      response.status(200).json(await getNotificationReadState(database, await getWorkspaceActor(request, 'events:read')));
    } catch (error) {
      next(error);
    }
  });
  app.put('/api/v1/notification-read-state', async (request, response, next) => {
    try {
      response.status(200).json(await upsertNotificationReadState(database, await getWorkspaceActor(request, 'workspace:write'), request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/api-endpoints', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listApiEndpoints(database, await getWorkspaceActor(request, 'systems:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/api-endpoints/:endpointId', async (request, response, next) => {
    try {
      response.status(200).json(
        await getApiEndpoint(database, await getWorkspaceActor(request, 'systems:read'), request.params.endpointId),
      );
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/api-endpoints', async (request, response, next) => {
    try {
      response.status(201).json(
        await createApiEndpoint(database, await getWorkspaceActor(request, 'systems:write'), request.body),
      );
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/api-endpoints/:endpointId', async (request, response, next) => {
    try {
      response.status(200).json(
        await updateApiEndpoint(
          database,
          await getWorkspaceActor(request, 'systems:write'),
          request.params.endpointId,
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/api-endpoints/:endpointId', async (request, response, next) => {
    try {
      response.status(200).json(
        await deleteApiEndpoint(database, await getWorkspaceActor(request, 'systems:write'), request.params.endpointId),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/environments', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listEnvironments(database, await getWorkspaceActor(request, 'systems:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/environments/:environmentId', async (request, response, next) => {
    try {
      response.status(200).json(
        await getEnvironment(database, await getWorkspaceActor(request, 'systems:read'), request.params.environmentId),
      );
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/environments', async (request, response, next) => {
    try {
      response.status(201).json(
        await createEnvironment(database, await getWorkspaceActor(request, 'systems:write'), request.body),
      );
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/environments/:environmentId', async (request, response, next) => {
    try {
      response.status(200).json(
        await updateEnvironment(
          database,
          await getWorkspaceActor(request, 'systems:write'),
          request.params.environmentId,
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/environments/:environmentId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteEnvironment(
        database,
        await getWorkspaceActor(request, 'systems:write'),
        request.params.environmentId,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/environments/:environmentId/deploy', async (request, response, next) => {
    try {
      response.status(200).json(
        await deployEnvironment(
          database,
          await getWorkspaceActor(request, 'systems:write'),
          request.params.environmentId,
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/environments/:environmentId/rollback', async (request, response, next) => {
    try {
      response.status(200).json(
        await rollbackEnvironment(
          database,
          await getWorkspaceActor(request, 'systems:write'),
          request.params.environmentId,
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/environment-deployments', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listEnvironmentDeployments(database, await getWorkspaceActor(request, 'systems:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/business-plans', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listBusinessPlans(database, await getWorkspaceActor(request, 'workspace:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/business-plans/:planId', async (request, response, next) => {
    try {
      response.status(200).json(await getBusinessPlan(database, await getWorkspaceActor(request, 'workspace:read'), request.params.planId));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/business-plans', async (request, response, next) => {
    try {
      response.status(201).json(await createBusinessPlan(database, await getWorkspaceActor(request, 'workspace:write'), request.body));
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/business-plans/:planId', async (request, response, next) => {
    try {
      response.status(200).json(await updateBusinessPlan(database, await getWorkspaceActor(request, 'workspace:write'), request.params.planId, request.body));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/business-plans/:planId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteBusinessPlan(database, await getWorkspaceActor(request, 'workspace:write'), request.params.planId));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/business-plans/:planId/editing-sessions', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listBusinessPlanSessions(database, await getWorkspaceActor(request, 'workspace:read'), request.params.planId),
      });
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/business-plans/:planId/editing-sessions', async (request, response, next) => {
    try {
      response.status(200).json(await upsertBusinessPlanSession(database, await getWorkspaceActor(request, 'workspace:write'), {
        ...request.body,
        planId: request.params.planId,
      }));
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/business-plans/:planId/editing-sessions/:sessionId', async (request, response, next) => {
    try {
      response.status(200).json(await updateBusinessPlanSession(database, await getWorkspaceActor(request, 'workspace:write'), request.params.sessionId, request.body));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/business-plans/:planId/editing-sessions/:sessionId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteBusinessPlanSession(database, await getWorkspaceActor(request, 'workspace:write'), request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/context-sources', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listContextSources(database, await getWorkspaceActor(request, 'systems:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-sources/:sourceId', async (request, response, next) => {
    try {
      response.status(200).json(await getContextSource(database, await getWorkspaceActor(request, 'systems:read'), request.params.sourceId));
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/context-sources/:sourceId', async (request, response, next) => {
    try {
      response.status(200).json(await updateContextSource(database, await getWorkspaceActor(request, 'systems:write'), request.params.sourceId, request.body));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/context-sources/:sourceId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteContextSource(database, await getWorkspaceActor(request, 'systems:write'), request.params.sourceId));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-sources/:sourceId/versions', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listContextSourceVersions(database, await getWorkspaceActor(request, 'systems:read'), request.params.sourceId),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-source-versions', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listAllContextSourceVersions(database, await getWorkspaceActor(request, 'systems:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-source-versions/:versionId', async (request, response, next) => {
    try {
      response.status(200).json(await getContextSourceVersion(database, await getWorkspaceActor(request, 'systems:read'), request.params.versionId));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/context-source-versions/:versionId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteContextSourceVersion(database, await getWorkspaceActor(request, 'systems:write'), request.params.versionId));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-source-items', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listContextSourceItems(database, await getWorkspaceActor(request, 'systems:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-source-items/:itemId', async (request, response, next) => {
    try {
      response.status(200).json(await getContextSourceItem(database, await getWorkspaceActor(request, 'systems:read'), request.params.itemId));
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/context-source-items/:itemId', async (request, response, next) => {
    try {
      response.status(200).json(await updateContextSourceItem(database, await getWorkspaceActor(request, 'systems:write'), request.params.itemId, request.body));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/context-source-items/:itemId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteContextSourceItem(database, await getWorkspaceActor(request, 'systems:write'), request.params.itemId));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-source-folders', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listContextSourceFolders(database, await getWorkspaceActor(request, 'systems:read')),
      });
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/context-source-folders', async (request, response, next) => {
    try {
      response.status(201).json(await createContextSourceFolder(database, await getWorkspaceActor(request, 'systems:write'), request.body));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/context-source-folders/:folderId', async (request, response, next) => {
    try {
      response.status(200).json(await getContextSourceFolder(database, await getWorkspaceActor(request, 'systems:read'), request.params.folderId));
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/context-source-folders/:folderId', async (request, response, next) => {
    try {
      response.status(200).json(await updateContextSourceFolder(database, await getWorkspaceActor(request, 'systems:write'), request.params.folderId, request.body));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/context-source-folders/:folderId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteContextSourceFolder(database, await getWorkspaceActor(request, 'systems:write'), request.params.folderId));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/context-ingestions/extract', async (request, response, next) => {
    try {
      await getWorkspaceActor(request, 'systems:read');
      response.status(200).json(await extractContextPayload(request.body, aiProvider));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/context-ingestions', async (request, response, next) => {
    try {
      response.status(201).json(await ingestContext(
        database,
        await getWorkspaceActor(request, 'systems:write'),
        request.body,
        aiProvider,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/accounts/:accountId', async (request, response, next) => {
    try {
      response.status(200).json(
        await getAccount(database, await getWorkspaceActor(request, 'growth:read'), request.params.accountId),
      );
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/accounts', async (request, response, next) => {
    try {
      response.status(201).json(
        await createAccount(database, await getWorkspaceActor(request, 'growth:write'), request.body),
      );
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/accounts/:accountId', async (request, response, next) => {
    try {
      response.status(200).json(await updateAccount(
        database,
        await getWorkspaceActor(request, 'growth:write'),
        request.params.accountId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/accounts/:accountId', async (request, response, next) => {
    try {
      response.status(200).json(
        await deleteAccount(database, await getWorkspaceActor(request, 'growth:write'), request.params.accountId),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/leads', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listLeads(database, await getWorkspaceActor(request, 'growth:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/leads/:leadId', async (request, response, next) => {
    try {
      response.status(200).json(
        await getLead(database, await getWorkspaceActor(request, 'growth:read'), request.params.leadId),
      );
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/leads', async (request, response, next) => {
    try {
      response.status(201).json(
        await createLead(database, await getWorkspaceActor(request, 'growth:write'), request.body),
      );
    } catch (error) {
      next(error);
    }
  });
  app.patch('/api/v1/leads/:leadId', async (request, response, next) => {
    try {
      response.status(200).json(await updateLead(
        database,
        await getWorkspaceActor(request, 'growth:write'),
        request.params.leadId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/leads/:leadId', async (request, response, next) => {
    try {
      response.status(200).json(
        await deleteLead(database, await getWorkspaceActor(request, 'growth:write'), request.params.leadId),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/creative-items/:itemId', async (request, response, next) => {
    try {
      response.status(200).json(
        await getCreativeItem(database, await getWorkspaceActor(request, 'creative:read'), request.params.itemId),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/creative-items', async (request, response, next) => {
    try {
      response.status(201).json(
        await createCreativeItem(database, await getWorkspaceActor(request, 'creative:write'), request.body),
      );
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/creative-items/:itemId', async (request, response, next) => {
    try {
      response.status(200).json(
        await updateCreativeItem(
          database,
          await getWorkspaceActor(request, 'creative:write'),
          request.params.itemId,
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/creative-items/:itemId', async (request, response, next) => {
    try {
      response.status(200).json(
        await deleteCreativeItem(database, await getWorkspaceActor(request, 'creative:write'), request.params.itemId),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/creative-assets', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listCreativeAssets(database, await getWorkspaceActor(request, 'creative:read'), assetStore),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/v1/creative-assets/upload',
    async (request, response, next) => {
      try {
        response.status(201).json(await uploadCreativeAsset(
          database,
          assetStore,
          await getWorkspaceActor(request, 'creative:write'),
          {
            fileName: request.header('x-file-name'),
            mimeType: request.header('x-file-content-type'),
            fileSize: Number(request.header('x-file-size')),
            title: request.header('x-asset-title') || undefined,
            creativeId: request.header('x-creative-id') || null,
            assetType: request.header('x-asset-type') || undefined,
          },
          request,
        ));
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch('/api/v1/creative-assets/:assetId', async (request, response, next) => {
    try {
      response.status(200).json(
        await updateCreativeAsset(
          database,
          await getWorkspaceActor(request, 'creative:write'),
          request.params.assetId,
          request.body,
          assetStore,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/creative-assets/:assetId/download', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'creative:read');
      await getCreativeAsset(database, actor, request.params.assetId, assetStore);
      response.status(200).json({
        url: `/api/v1/creative-assets/${encodeURIComponent(request.params.assetId)}/content`,
        requiresAuthentication: true,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/creative-assets/:assetId/content', async (request, response, next) => {
    try {
      const asset = await getCreativeAssetDownload(
        database,
        assetStore,
        await getWorkspaceActor(request, 'creative:read'),
        request.params.assetId,
      );
      response.status(200);
      response.setHeader('Content-Type', asset.contentType);
      response.setHeader('Content-Length', String(asset.size));
      response.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
      );
      asset.stream.once('error', next);
      asset.stream.pipe(response);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/creative-assets/:assetId', async (request, response, next) => {
    try {
      response.status(200).json(
        await getCreativeAsset(database, await getWorkspaceActor(request, 'creative:read'), request.params.assetId, assetStore),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/events', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'events:read');
      const cursorHeader = request.header('last-event-id');
      const cursor = cursorHeader ? Number.parseInt(cursorHeader, 10) : undefined;
      if (cursorHeader && (!Number.isInteger(cursor) || (cursor as number) < 0)) {
        response.status(400).json({ error: 'Last-Event-ID must be a non-negative integer.' });
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      response.write('retry: 3000\n\n');

      const unsubscribe = workspaceEvents.subscribe(
        actor.workspaceId,
        (event) => {
          response.write(`id: ${event.id}\n`);
          response.write(`event: ${event.resource}.${event.type}\n`);
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        cursor,
      );
      const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
      heartbeat.unref();
      request.once('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/members', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listWorkspaceMembers(database, await getWorkspaceActor(request, 'members:read')),
      });
    } catch (error) {
      next(error);
    }
  });

  // Compatibility aliases used by the generic MCP resource surface.
  app.get('/api/v1/users', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listWorkspaceMembers(database, await getWorkspaceActor(request, 'members:read')),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/companies', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'workspace:read');
      const rows = await database.select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      }).from(workspace).where(eq(workspace.id, actor.workspaceId)).limit(1);
      response.status(200).json({
        data: rows.map((row) => ({
          ...row,
          ownerId: actor.userId,
          companyId: row.id,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/invitations', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listWorkspaceInvitations(database, await getWorkspaceActor(request, 'members:read')),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/invitations', async (request, response, next) => {
    try {
      response.status(201).json(
        await createWorkspaceInvitation(
          database,
          config,
          await getWorkspaceActor(request, 'workspace:write'),
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/team-chat-channels', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listTeamChatChannels(
          database,
          await getWorkspaceActor(request, 'chat:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/team-chat-channels/:channelId', async (request, response, next) => {
    try {
      response.status(200).json(await getTeamChatChannel(
        database,
        await getWorkspaceActor(request, 'chat:read'),
        request.params.channelId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/blog-articles', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listBlogArticles(
          database,
          await getWorkspaceActor(request, 'content:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-desks', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorDesks(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-desks/:deskId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getOperatorDesk(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.params.deskId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/operator-desks', async (request, response, next) => {
    try {
      response.status(201).json(await createOperatorDesk(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/operator-desks/:deskId', async (request, response, next) => {
    try {
      response.status(200).json(await updateOperatorDesk(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.deskId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/operator-desks/:deskId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteOperatorDesk(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.deskId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/v1/operator-work-orders', '/api/v1/work-orders'], async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorWorkOrders(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-context-packs', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorContextPacks(
          database,
          await getWorkspaceActor(request, 'operators:read'),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/operator-context-packs', async (request, response, next) => {
    try {
      response.status(201).json(await createOperatorContextPack(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/operator-context-packs/:contextPackId', async (request, response, next) => {
    try {
      response.status(200).json(await getOperatorContextPack(
        database,
        await getWorkspaceActor(request, 'operators:read'),
        request.params.contextPackId,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/operator-context-packs/:contextPackId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteOperatorContextPack(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.contextPackId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-memories', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorMemories(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-memories/:memoryId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getOperatorMemory(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.params.memoryId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/operator-memories', async (request, response, next) => {
    try {
      response.status(201).json(await createOperatorMemory(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/operator-memories/:memoryId', async (request, response, next) => {
    try {
      response.status(200).json(await updateOperatorMemory(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.memoryId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/operator-memories/:memoryId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteOperatorMemory(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.memoryId,
      ));
    } catch (error) {
      next(error);
    }
  });

  for (const action of ['approve', 'reject', 'archive', 'restore'] as const) {
    app.post(`/api/v1/operator-memories/:memoryId/${action}`, async (request, response, next) => {
      try {
        response.status(200).json(await transitionOperatorMemory(
          database,
          await getWorkspaceActor(request, 'operators:write'),
          request.params.memoryId,
          action,
        ));
      } catch (error) {
        next(error);
      }
    });
  }

  app.get('/api/v1/operator-checkins', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorCheckins(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/operator-checkins/:checkinId', async (request, response, next) => {
    try {
      response.status(200).json(await getOperatorCheckin(
        database,
        await getWorkspaceActor(request, 'operators:read'),
        request.params.checkinId,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/v1/operator-checkins', async (request, response, next) => {
    try {
      response.status(201).json(await submitOperatorCheckin(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/operator-checkins/:checkinId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteOperatorCheckin(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.checkinId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-outputs', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorOutputs(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-outputs/:outputId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getOperatorOutput(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.params.outputId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/operator-outputs/:outputId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteOperatorOutput(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.outputId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/operator-outputs', async (request, response, next) => {
    try {
      response.status(201).json(await submitOperatorOutput(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-injections', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorInjections(
          database,
          await getWorkspaceActor(request, 'operators:read'),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-injections/:injectionId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getOperatorInjection(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.params.injectionId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-approvals', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listOperatorApprovals(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-approvals/:approvalId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getOperatorApproval(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.params.approvalId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/operator-approvals/:approvalId/approve', async (request, response, next) => {
    try {
      response.status(200).json(await approveOperatorApproval(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.approvalId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/operator-approvals/:approvalId/reject', async (request, response, next) => {
    try {
      response.status(200).json(await rejectOperatorApproval(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.approvalId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-manifest', async (request, response, next) => {
    try {
      response.status(200).json(await buildOperatorManifest(
        database,
        await getWorkspaceActor(request, 'operators:read'),
        request.query,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/operator-work-orders/available', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listAvailableOperatorWorkOrders(
          database,
          await getWorkspaceActor(request, 'operators:read'),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/api/v1/operator-work-orders/:workOrderId', '/api/v1/work-orders/:workOrderId'], async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getOperatorWorkOrder(
          database,
          await getWorkspaceActor(request, 'operators:read'),
          request.params.workOrderId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(['/api/v1/operator-work-orders', '/api/v1/work-orders'], async (request, response, next) => {
    try {
      response.status(201).json(await createOperatorWorkOrder(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.patch(['/api/v1/operator-work-orders/:workOrderId', '/api/v1/work-orders/:workOrderId'], async (request, response, next) => {
    try {
      response.status(200).json(await updateOperatorWorkOrder(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.workOrderId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.delete(['/api/v1/operator-work-orders/:workOrderId', '/api/v1/work-orders/:workOrderId'], async (request, response, next) => {
    try {
      response.status(200).json(await deleteOperatorWorkOrder(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.workOrderId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post(['/api/v1/operator-work-orders/:workOrderId/claim', '/api/v1/work-orders/:workOrderId/claim'], async (request, response, next) => {
    try {
      response.status(200).json(await claimOperatorWorkOrder(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.workOrderId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post(['/api/v1/operator-work-orders/:workOrderId/release', '/api/v1/work-orders/:workOrderId/release'], async (request, response, next) => {
    try {
      response.status(200).json(await releaseOperatorWorkOrder(
        database,
        await getWorkspaceActor(request, 'operators:write'),
        request.params.workOrderId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/blog-articles/:articleId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getBlogArticle(
          database,
          await getWorkspaceActor(request, 'content:read'),
          request.params.articleId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/blog-articles', async (request, response, next) => {
    try {
      response.status(201).json(await createBlogArticle(
        database,
        await getWorkspaceActor(request, 'content:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/blog-articles/:articleId', async (request, response, next) => {
    try {
      response.status(200).json(await updateBlogArticle(
        database,
        await getWorkspaceActor(request, 'content:write'),
        request.params.articleId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/blog-articles/:articleId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteBlogArticle(
        database,
        await getWorkspaceActor(request, 'content:write'),
        request.params.articleId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/team-chat-channels', async (request, response, next) => {
    try {
      response.status(201).json(await createTeamChatChannel(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/team-chat-channels/:channelId', async (request, response, next) => {
    try {
      response.status(200).json(await updateTeamChatChannel(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.params.channelId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/team-chat-channels/:channelId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteTeamChatChannel(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.params.channelId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/team-chat-participants', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listTeamChatParticipants(
          database,
          await getWorkspaceActor(request, 'chat:read'),
          request.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/v1/team-chat-participants/:participantId', async (request, response, next) => {
    try {
      response.status(200).json(await getTeamChatParticipant(
        database,
        await getWorkspaceActor(request, 'chat:read'),
        request.params.participantId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/team-chat-participants', async (request, response, next) => {
    try {
      response.status(201).json(await createTeamChatParticipant(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/team-chat-participants/:participantId', async (request, response, next) => {
    try {
      response.status(200).json(await updateTeamChatParticipant(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.params.participantId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/team-chat-participants/:participantId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteTeamChatParticipant(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.params.participantId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/team-chat/channels/:channelId/participants', async (request, response, next) => {
    try {
      response.status(200).json(await addTeamChatParticipantToChannel(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.params.channelId,
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/team-chat/messages', async (request, response, next) => {
    try {
      response.status(200).json(await listTeamChatMessages(
        database,
        await getWorkspaceActor(request, 'chat:read'),
        request.query,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/team-chat-messages', async (request, response, next) => {
    try {
      response.status(200).json(await listTeamChatMessages(
        database,
        await getWorkspaceActor(request, 'chat:read'),
        request.query,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.get(['/api/v1/team-chat-messages/:messageId', '/api/v1/team-chat/messages/:messageId'], async (request, response, next) => {
    try {
      response.status(200).json(await getTeamChatMessage(
        database,
        await getWorkspaceActor(request, 'chat:read'),
        request.params.messageId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/team-chat-messages', async (request, response, next) => {
    try {
      response.status(201).json(await createTeamChatMessage(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/v1/team-chat-messages/:messageId', async (request, response, next) => {
    try {
      response.status(200).json(await deleteTeamChatMessage(
        database,
        await getWorkspaceActor(request, 'chat:write'),
        request.params.messageId,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/api-keys', async (request, response, next) => {
    try {
      assertApiKeyManagementIsUiOnly(request);
      response.status(200).json({
        data: await listStandaloneApiKeys(database, await getSessionWorkspaceActor(request)),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/api-keys', async (request, response, next) => {
    try {
      assertApiKeyManagementIsUiOnly(request);
      response.status(201).json(
        await createStandaloneApiKey(
          database,
          await getSessionWorkspaceActor(request),
          request.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/api-keys/:keyId', async (request, response, next) => {
    try {
      assertApiKeyManagementIsUiOnly(request);
      response.status(200).json(
        await revokeStandaloneApiKey(
          database,
          await getSessionWorkspaceActor(request),
          request.params.keyId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/tasks', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listTasks(database, await getWorkspaceActor(request, 'execution:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/tasks/:taskId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getTask(
          database,
          await getWorkspaceActor(request, 'execution:read'),
          request.params.taskId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/tasks', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await createTask(database, actor, request.body);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'created',
        resource: 'tasks',
        resourceId: result.id,
        data: result,
      });
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/tasks/:taskId', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await updateTask(database, actor, request.params.taskId, request.body);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'updated',
        resource: 'tasks',
        resourceId: result.id,
        data: result,
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/tasks/:taskId', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await deleteTask(database, actor, request.params.taskId);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'deleted',
        resource: 'tasks',
        resourceId: result.id,
        data: result,
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/focus-stacks', async (request, response, next) => {
    try {
      response.status(201).json(await createFocusStack(
        database,
        await getWorkspaceActor(request, 'execution:write'),
        request.body,
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/cycles/start-next', async (request, response, next) => {
    try {
      response.status(200).json(await startNextCycle(
        database,
        await getWorkspaceActor(request, 'execution:write'),
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/reports/changelog', async (request, response, next) => {
    try {
      response.status(200).json(await buildWeeklyChangelog(
        database,
        await getWorkspaceActor(request, 'workspace:read'),
        request.query.week ?? 'current',
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/cycle-goals', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listCycleGoals(database, await getWorkspaceActor(request, 'execution:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/cycle-goals/:goalId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getCycleGoal(
          database,
          await getWorkspaceActor(request, 'execution:read'),
          request.params.goalId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/cycle-goals', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await createCycleGoal(database, actor, request.body);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'created',
        resource: 'cycle-goals',
        resourceId: result.id,
        data: result,
      });
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/cycle-goals/:goalId', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await updateCycleGoal(database, actor, request.params.goalId, request.body);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'updated',
        resource: 'cycle-goals',
        resourceId: result.id,
        data: result,
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/cycle-goals/:goalId', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await deleteCycleGoal(database, actor, request.params.goalId);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'deleted',
        resource: 'cycle-goals',
        resourceId: result.id,
        data: result,
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/visions', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await listVisions(database, await getWorkspaceActor(request, 'execution:read'), request.query),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/visions/:visionId', async (request, response, next) => {
    try {
      response.status(200).json({
        data: await getVision(
          database,
          await getWorkspaceActor(request, 'execution:read'),
          request.params.visionId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/context-routing/:resource/:recordId', async (request, response, next) => {
    try {
      const resource = request.params.resource;
      let data: unknown;
      if (resource === 'tasks') {
        data = await getTask(
          database,
          await getWorkspaceActor(request, 'execution:read'),
          request.params.recordId,
        );
      } else if (resource === 'cycle-goals') {
        data = await getCycleGoal(
          database,
          await getWorkspaceActor(request, 'execution:read'),
          request.params.recordId,
        );
      } else if (resource === 'visions') {
        data = await getVision(
          database,
          await getWorkspaceActor(request, 'execution:read'),
          request.params.recordId,
        );
      } else if (resource === 'blog-articles') {
        data = await getBlogArticle(
          database,
          await getWorkspaceActor(request, 'content:read'),
          request.params.recordId,
        );
      } else if (resource === 'prompts') {
        data = await getPrompt(database, await getWorkspaceActor(request, 'workspace:read'), request.params.recordId);
      } else if (resource === 'social-posts') {
        data = await getSocialPost(database, await getWorkspaceActor(request, 'workspace:read'), request.params.recordId);
      } else if (resource === 'seo-keywords') {
        data = await getSeoKeyword(database, await getWorkspaceActor(request, 'workspace:read'), request.params.recordId);
      } else if (resource === 'feedbacks') {
        data = await getFeedback(database, await getWorkspaceActor(request, 'workspace:read'), request.params.recordId);
      } else if (resource === 'time-blocks') {
        data = await getTimeBlock(database, await getWorkspaceActor(request, 'workspace:read'), request.params.recordId);
      } else {
        response.status(404).json({ error: 'Context routing is unavailable for this resource.' });
        return;
      }
      response.status(200).json({
        data,
        relatedContext: { attached: [], suggestions: [], hasMore: false },
        routing: {
          strategy: 'standalone-direct',
          resource,
          workspaceIsolated: true,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/visions', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await createVision(database, actor, request.body);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'created',
        resource: 'visions',
        resourceId: result.id,
        data: result,
      });
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/visions/:visionId', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await updateVision(database, actor, request.params.visionId, request.body);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'updated',
        resource: 'visions',
        resourceId: result.id,
        data: result,
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/visions/:visionId', async (request, response, next) => {
    try {
      const actor = await getWorkspaceActor(request, 'execution:write');
      const result = await deleteVision(database, actor, request.params.visionId);
      workspaceEvents.publish({
        workspaceId: actor.workspaceId,
        type: 'deleted',
        resource: 'visions',
        resourceId: result.id,
        data: result,
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  if (config.nodeEnv === 'production') {
    const staticDirectory = path.resolve('dist');
    app.use(express.static(staticDirectory, { index: false }));
    app.get('*', (_request, response) => {
      response.sendFile(path.join(staticDirectory, 'index.html'));
    });
  }

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (
      error instanceof BootstrapError ||
      error instanceof WorkspaceError ||
      error instanceof TaskError ||
      error instanceof CycleGoalError ||
      error instanceof VisionError ||
      error instanceof MemberError ||
      error instanceof StandaloneApiKeyError ||
      error instanceof TeamChatError ||
      error instanceof ContentError ||
      error instanceof OperatorError ||
      error instanceof OperatorRuntimeError ||
      error instanceof CreativeError ||
      error instanceof GrowthError
      || error instanceof TechnicalError
      || error instanceof SystemsError
      || error instanceof BusinessPlanError
      || error instanceof ContextError
      || error instanceof StrategyError
      || error instanceof FocusStackError
      || error instanceof ReportError
    ) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('[replofy-os] standalone server request failed', error);
    response.status(500).json({ error: 'Internal server error.' });
  };
  app.use(errorHandler);

  return app;
}
