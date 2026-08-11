import type { AIEngineOutput } from './types.js';

const insufficientEvidencePatterns = [
  /\b(?:insufficient|inadequate)\s+(?:evidence|information|content|detail|facts?)\b/i,
  /\b(?:no|not enough|without)\s+(?:meaningful|valuable|actionable|substantive|reliable|useful)\s+(?:evidence|information|content|detail|facts?|intent|steps?)\b/i,
  /\b(?:no|not enough|without)\s+(?:meaningful|valuable|actionable|substantive|reliable|useful)\b/i,
  /\b(?:cannot|can't|unable to|could not|couldn't)\s+(?:reliably\s+)?(?:extract|define|recommend|propose|operationalize|ground|create)\b/i,
  /\b(?:source|document|input|content)\b.{0,100}\b(?:does not|doesn't|lacks?|contains only|provides no|has no)\b.{0,100}\b(?:meaningful|valuable|actionable|substantive|reliable|useful|facts?|information|evidence)\b/i,
  /\b(?:source|document|input|content)\b.{0,100}\b(?:too sparse|too little|not substantive enough|not enough)\b/i,
];

export function hasInsufficientEvidenceSignal(output: Pick<AIEngineOutput, 'actionability' | 'answer' | 'summary' | 'assumptions'>) {
  if (output.actionability === 'insufficient_evidence') return true;
  const explanation = [output.answer, output.summary, ...output.assumptions].join('\n');
  return insufficientEvidencePatterns.some((pattern) => pattern.test(explanation));
}

/**
 * The provider can be asked for actions and still explain that the source is
 * not actionable. That explanation must win: unsupported changes must never
 * reach the proposal queue or autonomous memory writer.
 */
export function enforceAIActionability(output: AIEngineOutput): AIEngineOutput {
  if (!hasInsufficientEvidenceSignal(output)) return output;
  return {
    ...output,
    actionability: 'insufficient_evidence',
    actions: [],
    memoryMutations: [],
  };
}
