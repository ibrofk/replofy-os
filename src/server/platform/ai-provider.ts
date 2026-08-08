import type {
  GeminiRateLimitSnapshot,
  IngestionPayload,
} from '../../services/geminiServer.js';

export type AIContextExtractionInput = {
  fileName: string;
  content: string;
};

export type AIContextExtractionResult = {
  payload: IngestionPayload;
  usedGemini: boolean;
  model: string;
  rateLimit: GeminiRateLimitSnapshot;
  warning?: string;
};

export interface AIProvider {
  extractContext(input: AIContextExtractionInput): Promise<AIContextExtractionResult>;
}
