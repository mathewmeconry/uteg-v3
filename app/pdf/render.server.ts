import { resolve as resolvePath } from 'node:path';
import { Worker } from 'node:worker_threads';
import bold from './fonts/Roboto-Bold.ttf?inline';
import regular from './fonts/Roboto-Regular.ttf?inline';
import { DomainError } from '~/lib/errors';
import type { PdfJob, PdfResult } from './worker';

type PdfOutput = Extract<PdfResult, { pdf: Uint8Array }>;

/** The PDF takes too long, or too many are being rendered. */
export class PdfUnavailableError extends Error {
  override name = 'PdfUnavailableError';
}

type Task = {
  job: PdfJob;
  worker?: Worker;
  succeed: (output: PdfOutput) => void;
  fail: (error: unknown) => void;
};

const WORKERS = 2;
const MAX_QUEUE = 20;
const TIMEOUT_MS = 20_000;

const idle: Worker[] = [];
const queue: Task[] = [];
let running = 0;

export async function renderPdf(...args: Parameters<typeof runPdfJob>) {
  return (await runPdfJob(...args)).pdf;
}

/**
 * Runs in worker threads, because it takes up to seconds and would block everyone else. Ends a
 * worker that takes too long or whose request was aborted.
 */
export function runPdfJob(
  job: PdfJob,
  { signal, timeoutMs = TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<PdfOutput> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (queue.length >= MAX_QUEUE) return reject(new PdfUnavailableError('Queue is full'));

    const task: Task = {
      job,
      succeed(output) {
        settle();
        resolve(output);
      },
      fail(error) {
        settle();
        reject(error);
      },
    };
    // Waiting counts as well.
    const timeout = setTimeout(() => cancel(new PdfUnavailableError('Timeout')), timeoutMs);

    function settle() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
    function cancel(error: unknown) {
      const index = queue.indexOf(task);
      if (index >= 0) queue.splice(index, 1);
      task.fail(error);
      // Its exit makes room for the next one.
      void task.worker?.terminate();
      task.worker = undefined;
    }
    function onAbort() {
      cancel(signal?.reason);
    }

    signal?.addEventListener('abort', onAbort);
    queue.push(task);
    startNext();
  });
}

function startNext() {
  while (running < WORKERS) {
    const task = queue.shift();
    if (!task) return;
    start(task);
  }
}

function start(task: Task) {
  const worker = idle.pop() ?? createWorker();
  task.worker = worker;
  running++;

  function finish() {
    worker.off('message', onMessage).off('error', onError).off('exit', onExit);
    task.worker = undefined;
    running--;
    startNext();
  }
  /** Also when it runs out of memory. The exit follows. */
  function onError(error: unknown) {
    task.fail(new PdfUnavailableError(String(error)));
  }
  function onExit() {
    task.fail(new PdfUnavailableError('The worker exited'));
    finish();
  }
  function onMessage(result: PdfResult) {
    // Cancelled just now, the exit follows.
    if (!task.worker) return;
    // In development the next one gets the current code.
    if (import.meta.env.MODE === 'development') void worker.terminate();
    else idle.push(worker);
    if ('pdf' in result) task.succeed(result);
    else if ('coverError' in result) task.fail(new DomainError(result.coverError));
    else task.fail(new Error(result.error));
    finish();
  }

  worker.on('message', onMessage).on('error', onError).on('exit', onExit);
  try {
    worker.postMessage(task.job);
  } catch (error) {
    // Something in the job cannot be sent. The worker never saw it.
    idle.push(worker);
    task.fail(error);
    finish();
  }
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
