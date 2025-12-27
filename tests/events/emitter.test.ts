/**
 * Event Emitter Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../src/events/emitter.js';
import type { AgentEvent } from '../../src/events/types.js';

describe('EventEmitter', () => {
  describe('subscribe', () => {
    it('should add a handler', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      emitter.subscribe(handler);
      emitter.emit({ type: 'thinking', content: 'test', streaming: false });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      const unsubscribe = emitter.subscribe(handler);
      unsubscribe();
      emitter.emit({ type: 'thinking', content: 'test', streaming: false });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers', () => {
      const emitter = new EventEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.subscribe(handler1);
      emitter.subscribe(handler2);
      emitter.emit({ type: 'thinking', content: 'test', streaming: false });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit', () => {
    it('should call all handlers with the event', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();
      const event: AgentEvent = { type: 'thinking', content: 'test', streaming: false };

      emitter.subscribe(handler);
      emitter.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle errors in handlers gracefully', () => {
      const emitter = new EventEmitter();
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.subscribe(errorHandler);
      emitter.subscribe(goodHandler);
      emitter.emit({ type: 'thinking', content: 'test', streaming: false });

      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('buffering', () => {
    it('should buffer events when enabled', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      emitter.subscribe(handler);
      emitter.enableBuffering();
      emitter.emit({ type: 'thinking', content: 'test1', streaming: false });
      emitter.emit({ type: 'thinking', content: 'test2', streaming: false });

      // Handler should still be called
      expect(handler).toHaveBeenCalledTimes(2);

      // Events should be buffered
      const events = emitter.disableBuffering();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('thinking');
      expect(events[1].type).toBe('thinking');
    });

    it('should clear buffer on disable', () => {
      const emitter = new EventEmitter();

      emitter.enableBuffering();
      emitter.emit({ type: 'thinking', content: 'test', streaming: false });
      emitter.disableBuffering();

      // Buffer should be cleared
      const events = emitter.disableBuffering();
      expect(events).toHaveLength(0);
    });

    it('should not buffer when disabled', () => {
      const emitter = new EventEmitter();

      emitter.emit({ type: 'thinking', content: 'test', streaming: false });
      const events = emitter.disableBuffering();

      expect(events).toHaveLength(0);
    });
  });
});
