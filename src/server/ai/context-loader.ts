import type { WorkspaceRepository as PostgresDatabase } from '../platform/workspace-repository.js';
import type { WorkspaceActor } from '../execution/tasks.js';
import { getBusinessPlan } from '../business-plans.js';
import { getBlogArticle } from '../content.js';
import { getContextSource, getContextSourceItem, getContextSourceVersion } from '../context.js';
import { getCreativeAsset, getCreativeItem } from '../creative.js';
import { getAccount, getLead } from '../growth.js';
import { getOperatorDesk, getOperatorWorkOrder } from '../operators.js';
import { getOperatorContextPack, getOperatorMemory, getOperatorOutput } from '../operator-runtime.js';
import { getCycleGoal } from '../execution/cycle-goals.js';
import { getTask } from '../execution/tasks.js';
import { getVision } from '../execution/visions.js';
import { getTeamChatChannel, getTeamChatMessage } from '../team-chat.js';
import { getBug, getRoadmapItem } from '../technical.js';
import { getApiEndpoint, getEnvironment } from '../systems.js';
import { getFeedback, getPrompt, getSeoKeyword, getSocialPost, getTimeBlock } from '../strategy.js';
import type { AIContextEnvelope, AIContextPart } from './types.js';

function asContextPart(resourceType: string, resourceId: string, record: unknown): AIContextPart {
  return {
    kind: 'record',
    title: `Current ${resourceType} record`,
    content: JSON.stringify(record),
    sourceReferences: [{ locator: `${resourceType}:${resourceId}`, title: resourceType }],
  };
}

export async function loadCurrentRecordContext(
  database: PostgresDatabase,
  actor: WorkspaceActor,
  context: AIContextEnvelope,
): Promise<AIContextPart[]> {
  if (!context.resourceType || !context.resourceId) return [];
  const { resourceType, resourceId } = context;
  try {
    let record: unknown;
    switch (resourceType) {
      case 'business-plans': record = await getBusinessPlan(database, actor, resourceId); break;
      case 'context-sources': record = await getContextSource(database, actor, resourceId); break;
      case 'context-source-items': record = await getContextSourceItem(database, actor, resourceId); break;
      case 'context-source-versions': record = await getContextSourceVersion(database, actor, resourceId); break;
      case 'tasks': record = await getTask(database, actor, resourceId); break;
      case 'cycle-goals':
      case 'goals': record = await getCycleGoal(database, actor, resourceId); break;
      case 'visions': record = await getVision(database, actor, resourceId); break;
      case 'team-chat-channels': record = await getTeamChatChannel(database, actor, resourceId); break;
      case 'team-chat-messages': record = await getTeamChatMessage(database, actor, resourceId); break;
      case 'blog-articles':
      case 'content': record = await getBlogArticle(database, actor, resourceId); break;
      case 'prompts': record = await getPrompt(database, actor, resourceId); break;
      case 'social-posts': record = await getSocialPost(database, actor, resourceId); break;
      case 'seo-keywords': record = await getSeoKeyword(database, actor, resourceId); break;
      case 'feedbacks': record = await getFeedback(database, actor, resourceId); break;
      case 'time-blocks': record = await getTimeBlock(database, actor, resourceId); break;
      case 'creative-items': record = await getCreativeItem(database, actor, resourceId); break;
      case 'creative-assets': record = await getCreativeAsset(database, actor, resourceId); break;
      case 'accounts': record = await getAccount(database, actor, resourceId); break;
      case 'leads': record = await getLead(database, actor, resourceId); break;
      case 'bugs': record = await getBug(database, actor, resourceId); break;
      case 'roadmap-items': record = await getRoadmapItem(database, actor, resourceId); break;
      case 'api-endpoints': record = await getApiEndpoint(database, actor, resourceId); break;
      case 'environments': record = await getEnvironment(database, actor, resourceId); break;
      case 'operator-desks': record = await getOperatorDesk(database, actor, resourceId); break;
      case 'operator-work-orders':
      case 'work-orders': record = await getOperatorWorkOrder(database, actor, resourceId); break;
      case 'operator-context-packs': record = await getOperatorContextPack(database, actor, resourceId); break;
      case 'operator-outputs': record = await getOperatorOutput(database, actor, resourceId); break;
      case 'operator-memories': record = await getOperatorMemory(database, actor, resourceId); break;
      default: return [];
    }
    return record ? [asContextPart(resourceType, resourceId, record)] : [];
  } catch {
    // The selected record may have been deleted between the UI request and the AI run.
    // Keep the run useful with the remaining envelope, sources, and memories.
    return [];
  }
}
