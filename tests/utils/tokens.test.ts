/**
 * Token Utils Tests
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateToTokens } from '../../src/utils/tokens.js';

describe('Token Utils', () => {
  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for text', () => {
      const text = 'Hello, world!';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate tokens for code', () => {
      const code = `function hello() {
  console.log("Hello, world!");
}`;
      const tokens = estimateTokens(code);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('truncateToTokens', () => {
    it('should return empty string for empty input', () => {
      expect(truncateToTokens('', 100)).toBe('');
    });

    it('should return full text if under limit', () => {
      const text = 'Hello';
      expect(truncateToTokens(text, 100)).toBe(text);
    });

    it('should truncate text to token limit', () => {
      const longText = 'Hello world! '.repeat(100);
      const truncated = truncateToTokens(longText, 10);
      expect(truncated.length).toBeLessThan(longText.length);
    });
  });
});
