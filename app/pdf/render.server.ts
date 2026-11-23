import { resolve as resolvePath } from 'node:path';
import { Worker } from 'node:worker_threads';
import bold from './fonts/Roboto-Bold.ttf?inline';
import regular from './fonts/Roboto-Regular.ttf?inline';
import type { PdfJob, PdfResult } from './worker';

/** The PDF takes too long, or too many are being rendered. */
export class PdfUnavailableError extends Error {
  override name = 'PdfUnavailableError';
}

type Task = {
  job: PdfJob;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  resolve: (pdf: Uint8Array) => void;
  reject: (error: unknown) => void;
};

const WORKERS = 2;
const MAX_QUEUE = 20;
const TIMEOUT_MS = 20_000;

const idle: Worker[] = [];
const queue: Task[] = [];
let running = 0;

/**
 * Renders in worker threads, because it takes up to seconds and would block everyone else. Ends a
 * worker that takes too long or whose request was aborted.
 */
export function renderPdf(
  job: PdfJob,
  { signal, timeoutMs = TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (queue.length >= MAX_QUEUE) return reject(new PdfUnavailableError('Queue is full'));

    queue.push({ job, timeoutMs, signal, resolve, reject });
    startNext();
  });
}

function startNext() {
  while (running < WORKERS) {
    const task = queue.shift();
    if (!task) return;
    if (task.signal?.aborted) task.reject(task.signal.reason);
    else start(task);
  }
}

function start({ job, timeoutMs, signal, resolve, reject }: Task) {
  const worker = idle.pop() ?? createWorker();
  const timeout = setTimeout(() => fail(new PdfUnavailableError('Timeout')), timeoutMs);
  running++;

  function finish() {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
    worker.off('message', onMessage).off('error', onError).off('exit', onExit);
    running--;
  }
  function fail(error: unknown) {
    finish();
    void worker.terminate();
    reject(error);
    startNext();
  }
  function onAbort() {
    fail(signal?.reason);
  }
  /** Also when it runs out of memory. */
  function onError(error: unknown) {
    fail(new PdfUnavailableError(String(error)));
  }
  function onExit() {
    fail(new PdfUnavailableError('The worker exited'));
  }
  function onMessage(result: PdfResult) {
    finish();
    // In development the next one gets the current code.
    if (import.meta.env.MODE === 'development') void worker.terminate();
    else idle.push(worker);
    if ('pdf' in result) resolve(result.pdf);
    else reject(new Error(result.error));
    startNext();
  }

  signal?.addEventListener('abort', onAbort);
  worker.on('message', onMessage).on('error', onError).on('exit', onExit);
  worker.postMessage(job);
}

function createWorker() {
  // Built by vite.pdf.config.ts for production.
  const worker = new Worker(
    resolvePath(import.meta.env.PROD ? 'build/server/pdf-worker.js' : 'app/pdf/worker.tsx'),
    {
      workerData: { regular, bold },
      execArgv: import.meta.env.PROD ? [] : ['--import', 'tsx'],
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    },
  );
  worker.unref();
  // An error without listener would end the server.
  worker.on('error', () => {});
  worker.on('exit', () => {
    const index = idle.indexOf(worker);
    if (index >= 0) idle.splice(index, 1);
  });
  return worker;
}
