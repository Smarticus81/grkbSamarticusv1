import type { ProgressEvent } from './types.js';

/**
 * Server-Sent Events stream multiplexer. Each call to `subscribe()` returns
 * an async iterator the API layer can pipe to a Response stream.
 */
export class SSEStream {
  private listeners = new Set<(e: ProgressEvent) => void>();

  publish(event: ProgressEvent): void {
    for (const l of this.listeners) l(event);
  }

  subscribe(): AsyncIterable<ProgressEvent> & { close: () => void } {
    const queue: ProgressEvent[] = [];
    let resolve: ((v: IteratorResult<ProgressEvent>) => void) | null = null;
    let closed = false;

    const listener = (e: ProgressEvent) => {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: e, done: false });
      } else {
        queue.push(e);
      }
    };
    this.listeners.add(listener);

    const iterator: AsyncIterator<ProgressEvent> = {
      next: () => {
        if (closed) return Promise.resolve({ value: undefined as any, done: true });
        if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
        return new Promise((r) => (resolve = r));
      },
      return: () => {
        closed = true;
        this.listeners.delete(listener);
        return Promise.resolve({ value: undefined as any, done: true });
      },
    };

    return {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      close() {
        closed = true;
      },
    };
  }
}

export function eventToSSE(event: ProgressEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
