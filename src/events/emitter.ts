/**
 * Event Emitter
 */

import type { AgentEvent, EventHandler } from './types.js';

/**
 * Typed event emitter for agent events
 */
export class EventEmitter {
  private handlers: Set<EventHandler> = new Set();
  private eventBuffer: AgentEvent[] = [];
  private bufferingEnabled = false;

  /**
   * Subscribe to all events
   */
  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Emit an event to all subscribers
   */
  emit(event: AgentEvent): void {
    if (this.bufferingEnabled) {
      this.eventBuffer.push(event);
    }
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  /**
   * Enable event buffering
   */
  enableBuffering(): void {
    this.bufferingEnabled = true;
  }

  /**
   * Disable buffering and get buffered events
   */
  disableBuffering(): AgentEvent[] {
    this.bufferingEnabled = false;
    const events = this.eventBuffer;
    this.eventBuffer = [];
    return events;
  }

}
