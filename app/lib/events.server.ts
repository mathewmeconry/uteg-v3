import { MAX_EVENT_IDS, type Topic } from './events';
import { logger } from './logger.server';

type Listener = (message: string) => void;

const KEEP_ALIVE_MS = 20_000;
const RETRY_MS = 2_000;

const globalStore = globalThis as typeof globalThis & {
  __eventBus?: Map<string, Set<Listener>>;
  __eventStreams?: Set<() => void>;
};

// Open streams must keep receiving events after Vite reloads this module.
const listeners = (globalStore.__eventBus ??= new Map<string, Set<Listener>>());
const openStreams = (globalStore.__eventStreams ??= new Set<() => void>());

/** Ends all streams, for the shutdown: the server waits for open responses. */
export function closeEventStreams() {
  for (const close of [...openStreams]) close();
}

/**
 * Tells everyone watching the competition that something changed. Call it after the commit. The
 * message is the topic, followed by the ids of what changed when they are known and few.
 */
export function publish(competitionId: string, topic: Topic, ids: readonly string[] = []) {
  const message = [topic, ...(ids.length > MAX_EVENT_IDS ? [] : ids)].join(' ');
  for (const listener of [...(listeners.get(competitionId) ?? [])]) {
    try {
      listener(message);
    } catch (error) {
      logger.error({ error, topic }, 'Event listener failed');
    }
  }
}

export function subscribe(competitionId: string, listener: Listener) {
  const set = listeners.get(competitionId) ?? new Set();
  listeners.set(competitionId, set.add(listener));
  return () => {
    set.delete(listener);
    if (set.size === 0 && listeners.get(competitionId) === set) listeners.delete(competitionId);
  };
}

/**
 * A server-sent event stream of the competition's messages. `isAllowed` is asked before every event
 * and keep-alive, so a revoked link loses the stream.
 */
export function createEventStream(
  request: Request,
  competitionId: string,
  { isAllowed = async () => true }: { isAllowed?: () => Promise<boolean> } = {},
) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      function close() {
        if (closed) return;
        cleanup();
        controller.close();
      }

      async function send(message: string) {
        const allowed = await isAllowed().catch((error: unknown) => {
          logger.error({ error }, 'Could not check the access to an event stream');
          return false;
        });
        if (closed) return;
        if (allowed) controller.enqueue(encoder.encode(message));
        else close();
      }

      const unsubscribe = subscribe(competitionId, (message) => void send(`data: ${message}\n\n`));
      const timer = setInterval(() => void send(': keep-alive\n\n'), KEEP_ALIVE_MS);
      cleanup = () => {
        closed = true;
        openStreams.delete(close);
        unsubscribe();
        clearInterval(timer);
        request.signal.removeEventListener('abort', close);
      };

      openStreams.add(close);
      controller.enqueue(encoder.encode(`retry: ${RETRY_MS}\n\n`));
      request.signal.addEventListener('abort', close);
      if (request.signal.aborted) close();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
