export type ContextDocumentClassification =
  | 'company_memory'
  | 'blog_context'
  | 'creative_style_guide'
  | 'product_spec'
  | 'bug_technical_context'
  | 'research_source'
  | 'legal_trust_document'
  | 'operator_specific_memory'
  | 'general_context';

export type ContextExtractionProposal = {
  classification: ContextDocumentClassification;
  summary: string;
  keyFacts: string[];
  decisions: string[];
  constraints: string[];
  styleRules: string[];
  actionItems: string[];
  relatedHubs: string[];
  suggestedMemories: string[];
  suggestedTasks: string[];
  suggestedSources: string[];
  suggestedWorkOrders: string[];
  suggestedContextPacks: string[];
  suggestedOperatorDeskAttachments: string[];
};

const rules: Array<{ classification: ContextDocumentClassification; terms: string[]; hubs: string[] }> = [
  { classification: 'creative_style_guide', terms: ['brand', 'visual', 'style', 'tone', 'logo', 'creative'], hubs: ['creative-items', 'blog-articles', 'operator-memories'] },
  { classification: 'legal_trust_document', terms: ['legal', 'privacy', 'security', 'trust', 'gdpr', 'terms'], hubs: ['context-sources', 'tasks', 'operator-memories'] },
  { classification: 'bug_technical_context', terms: ['bug', 'reproduce', 'error', 'stack', 'incident', 'fix'], hubs: ['bugs', 'tasks', 'operator-memories'] },
  { classification: 'product_spec', terms: ['feature', 'acceptance criteria', 'roadmap', 'product', 'implementation'], hubs: ['roadmap-items', 'tasks', 'prompts'] },
  { classification: 'blog_context', terms: ['blog', 'seo', 'keyword', 'article', 'content'], hubs: ['blog-articles', 'seo-keywords', 'creative-items'] },
  { classification: 'research_source', terms: ['research', 'market', 'competitor', 'trend', 'survey'], hubs: ['context-sources', 'roadmap-items', 'blog-articles'] },
  { classification: 'operator_specific_memory', terms: ['operator', 'workflow rule', 'always', 'never'], hubs: ['operator-memories'] },
  { classification: 'company_memory', terms: ['company', 'vision', 'mission', 'decision', 'strategy'], hubs: ['visions', 'business-plans', 'operator-memories'] },
];

export function classifyContextDocument(title: string, content: string): ContextExtractionProposal {
  const normalized = `${title}\n${content}`.toLowerCase();
  const match = rules
    .map((rule) => ({ ...rule, score: rule.terms.filter((term) => normalized.includes(term)).length }))
    .sort((a, b) => b.score - a.score)[0];
  const classification = match?.score ? match.classification : 'general_context';
  const relatedHubs = match?.score ? match.hubs : ['context-sources'];
  const sentences = content.split(/[\r\n.]+/).map((item) => item.trim()).filter((item) => item.length > 20).slice(0, 8);
  const constraints = sentences.filter((item) => /\b(must|never|avoid|only|do not|should not)\b/i.test(item)).slice(0, 4);
  const decisions = sentences.filter((item) => /\b(decide|decision|approved|use|focus|priority)\b/i.test(item)).slice(0, 4);
  const actionItems = sentences.filter((item) => /\b(task|todo|action|implement|create|update|publish|review)\b/i.test(item)).slice(0, 4);
  const suggestedOperatorDeskAttachments =
    classification === 'creative_style_guide' ? ['creative-operator', 'blog-operator'] :
    classification === 'bug_technical_context' ? ['bug-triage-operator'] :
    classification === 'product_spec' ? ['feature-planner-operator'] :
    classification === 'blog_context' ? ['blog-operator', 'seo-growth-operator'] :
    classification === 'research_source' ? ['research-operator'] :
    ['launch-operator'];
  return {
    classification,
    summary: sentences.slice(0, 3).join('. ') || `Uploaded ${classification.replaceAll('_', ' ')} context.`,
    keyFacts: sentences.slice(0, 5),
    decisions,
    constraints,
    styleRules: classification === 'creative_style_guide' || classification === 'blog_context' ? constraints : [],
    actionItems,
    relatedHubs,
    suggestedMemories: [...constraints, ...decisions].slice(0, 5),
    suggestedTasks: actionItems,
    suggestedSources: suggestedOperatorDeskAttachments,
    suggestedWorkOrders: actionItems.length ? actionItems : [`Review ${classification.replaceAll('_', ' ')} context and submit safe follow-up output.`],
    suggestedContextPacks: [`${title} context pack`],
    suggestedOperatorDeskAttachments,
  };
}
