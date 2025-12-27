/**
 * Token estimation utilities
 */

import { Tiktoken, get_encoding } from 'tiktoken';

let encoder: Tiktoken | null = null;

/**
 * Get the tiktoken encoder (lazy initialization)
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = get_encoding('cl100k_base');
  }
  return encoder;
}

/**
 * Estimate token count for a string
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    return getEncoder().encode(text).length;
  } catch {
    // Fallback: rough estimate of 4 chars per token
    return Math.ceil(text.length / 4);
  }
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (!text) return '';

  const tokens = getEncoder().encode(text);
  if (tokens.length <= maxTokens) {
    return text;
  }

  const truncated = tokens.slice(0, maxTokens);
  return new TextDecoder().decode(getEncoder().decode(truncated));
}
