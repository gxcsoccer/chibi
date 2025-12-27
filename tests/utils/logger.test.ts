/**
 * Logger Tests
 */

import { describe, it, expect } from 'vitest';
import { initLogger, getLogger } from '../../src/utils/logger.js';

describe('Logger', () => {
  describe('getLogger', () => {
    it('should return a logger instance', () => {
      const logger = getLogger();

      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.warn).toBeDefined();
    });

    it('should return the same instance on multiple calls', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2);
    });
  });

  describe('initLogger', () => {
    it('should initialize logger with config', () => {
      const logger = initLogger({
        level: 'debug',
        pretty: false,
      });

      expect(logger).toBeDefined();
      expect(logger.level).toBe('debug');
    });

    it('should initialize with pretty output', () => {
      const logger = initLogger({
        level: 'info',
        pretty: true,
      });

      expect(logger).toBeDefined();
    });

    it('should initialize with file destination', () => {
      const logger = initLogger({
        level: 'info',
        pretty: false,
        destination: '/dev/null',
      });

      expect(logger).toBeDefined();
    });
  });
});
