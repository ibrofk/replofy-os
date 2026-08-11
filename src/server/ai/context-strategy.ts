import { aiContextModes, type AIContextEnvelope, type AIContextMode } from './types.js';

export type AIContextStrategy = {
  mode: AIContextMode;
  label: string;
  description: string;
  memoryLimit: number;
  projectionLimit: number;
  memoryChars: number;
  sourceChars: number;
  historyChars: number;
  domainChars: number;
  toolChars: number;
};

const strategies: Record<AIContextMode, AIContextStrategy> = {
  focused: {
    mode: 'focused',
    label: 'Focused',
    description: 'Current surface and a small evidence set for a fast, precise answer.',
    memoryLimit: 8,
    projectionLimit: 8,
    memoryChars: 6_000,
    sourceChars: 14_000,
    historyChars: 6_000,
    domainChars: 6_000,
    toolChars: 6_000,
  },
  workspace: {
    mode: 'workspace',
    label: 'Workspace',
    description: 'Current surface plus relevant workspace memory and linked sources.',
    memoryLimit: 16,
    projectionLimit: 20,
    memoryChars: 12_000,
    sourceChars: 24_000,
    historyChars: 8_000,
    domainChars: 8_000,
    toolChars: 8_000,
  },
  deep: {
    mode: 'deep',
    label: 'Deep',
    description: 'A wider evidence search for planning, analysis, and cross-domain proposals.',
    memoryLimit: 30,
    projectionLimit: 40,
    memoryChars: 20_000,
    sourceChars: 40_000,
    historyChars: 12_000,
    domainChars: 12_000,
    toolChars: 10_000,
  },
};

export function getAIContextStrategy(context: Pick<AIContextEnvelope, 'metadata'>): AIContextStrategy {
  const requested = context.metadata?.contextMode;
  const mode = typeof requested === 'string' && aiContextModes.includes(requested as AIContextMode)
    ? requested as AIContextMode
    : 'workspace';
  return strategies[mode];
}
