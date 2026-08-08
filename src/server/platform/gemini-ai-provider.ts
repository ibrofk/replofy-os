import { handleGeminiIngestionRequest } from '../../services/geminiServer.js';
import type {
  AIContextExtractionInput,
  AIContextExtractionResult,
  AIProvider,
} from './ai-provider.js';

/**
 * The default provider keeps the existing Gemini-plus-local-fallback behavior
 * behind the server's AI boundary. A test or deployment can inject another
 * provider without changing context persistence code.
 */
export class GeminiAIProvider implements AIProvider {
  async extractContext(input: AIContextExtractionInput): Promise<AIContextExtractionResult> {
    return handleGeminiIngestionRequest(input);
  }
}
