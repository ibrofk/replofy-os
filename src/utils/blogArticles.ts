import type {
  BlogArticle,
  BlogArticleStatus,
  BlogBrief,
  BlogDistribution,
  BlogEvidence,
  BlogPriority,
  BlogRoadmapPhase,
} from '../types';

export const BLOG_ARTICLE_STATUSES: BlogArticleStatus[] = [
  'idea',
  'planned',
  'researching',
  'drafting',
  'review',
  'scheduled',
  'published',
  'archived',
  'rejected',
];

export const BLOG_ROADMAP_PHASES: BlogRoadmapPhase[] = ['now', 'next', 'later'];

export const BLOG_PRIORITIES: BlogPriority[] = ['high', 'medium', 'low'];

export function normalizeBlogArticleStatus(status: BlogArticle['status']): BlogArticleStatus {
  switch (status) {
    case 'brainstorming':
      return 'idea';
    case 'collecting-data':
    case 'collecting-docs':
      return 'researching';
    case 'validating':
      return 'review';
    case 'progressing':
      return 'drafting';
    case 'finished':
      return 'published';
    default:
      return status;
  }
}

export function createEmptyBlogBrief(): BlogBrief {
  return {
    audience: '',
    painPoint: '',
    buyingTrigger: '',
    brokenBelief: '',
    replofyAngle: '',
    thesis: '',
    cta: '',
    contentCluster: '',
  };
}

export function readBlogBrief(article: BlogArticle): BlogBrief {
  return {
    ...createEmptyBlogBrief(),
    ...article.brief,
  };
}

export function createEmptyBlogDistribution(): BlogDistribution {
  return {
    seoTitle: '',
    metaDescription: '',
    primaryKeyword: '',
    channels: [],
    publicationUrl: '',
  };
}

export function readBlogDistribution(article: BlogArticle): BlogDistribution {
  return {
    ...createEmptyBlogDistribution(),
    metaDescription: article.summary || '',
    ...article.distribution,
    channels: article.distribution?.channels || [],
  };
}

export function readBlogEvidence(article: BlogArticle): BlogEvidence[] {
  if (article.evidence !== undefined) return article.evidence;

  return (article.dataPoints || []).map((claim, index) => ({
    id: `legacy-data-point-${index}`,
    claim,
    confidence: 'unverified',
    usedInDraft: false,
  }));
}

export function readBlogTags(article: BlogArticle) {
  return article.tags || [];
}

export function readLinkedSourceIds(article: BlogArticle) {
  return article.linkedSourceIds || [];
}

export function isActiveBlogArticle(article: BlogArticle) {
  const status = normalizeBlogArticleStatus(article.status);
  return status !== 'published' && status !== 'archived' && status !== 'rejected';
}

export function isPublishedBlogArticle(article: BlogArticle) {
  return normalizeBlogArticleStatus(article.status) === 'published';
}
