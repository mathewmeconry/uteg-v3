import { fork, type ChildProcess } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import bold from './fonts/Roboto-Bold.ttf?inline';
import regular from './fonts/Roboto-Regular.ttf?inline';
import type { PdfJob, PdfMessage, PdfResult } from './worker';

/** The PDF takes too long, or too many are being rendered. */
export class PdfUnavailableError extends Error {
  override name = 'PdfUnavailableError';
}

type Task = {
  job: PdfJob;
  child?: ChildProcess;
  succeed: (pdf: Uint8Array) => void;
  fail: (error: unknown) => void;
};

const CHILDREN = 2;
const MAX_QUEUE = 20;
const TIMEOUT_MS = 20_000;
/**
 * Of the JavaScript heap. Buffers, e.g. of decompressed images, are not included, so images are
 * checked before, see png.server.ts and domain/jpeg.ts.
 */
const MAX_HEAP_MB = 512;

const idle: ChildProcess[] = [];
const queue: Task[] = [];
let running = 0;

/**
 * Renders in child processes. It takes up to seconds and would block everyone else, and running out
 * of memory ends a whole process, also from a worker thread. Kills a child that takes too long or
 * whose request was aborted.
 */
export function renderPdf(
  job: PdfJob,
  { signal, timeoutMs = TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (queue.length >= MAX_QUEUE) return reject(new PdfUnavailableError('Queue is full'));

    const task: Task = {
      job,
      succeed(pdf) {
        settle();
        resolve(pdf);
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
      task.child?.kill('SIGKILL');
      task.child = undefined;
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
  while (running < CHILDREN) {
    const task = queue.shift();
    if (!task) return;
    start(task);
  }
}

function start(task: Task) {
  let child: ChildProcess;
  try {
    child = takeChild();
  } catch (error) {
    // E.g. too many open files. Also called by events of other children, where nobody catches it.
    task.fail(new PdfUnavailableError(String(error)));
    return;
  }
  task.child = child;
  running++;

  function finish() {
    child.off('message', onMessage).off('error', onError).off('exit', onExit);
    task.child = undefined;
    running--;
    startNext();
  }
  /** It could not be started or reached. An exit may or may not follow. */
  function onError(error: Error) {
    child.kill('SIGKILL');
    task.fail(new PdfUnavailableError(error.message));
    finish();
  }
  /** Also when it runs out of memory. */
  function onExit(code: number | null, signal: string | null) {
    task.fail(new PdfUnavailableError(`The process ended with ${code ?? signal}`));
    finish();
  }
  function onMessage(message: unknown) {
    // Cancelled just now, the exit follows.
    if (!task.child) return;
    const result = message as PdfResult;
    // In development the next one gets the current code.
    if (import.meta.env.MODE === 'development') child.kill();
    else idle.push(child);
    if ('pdf' in result) task.succeed(new Uint8Array(result.pdf));
    else task.fail(new Error(result.error));
    finish();
  }

  child.on('message', onMessage).on('error', onError).on('exit', onExit);
  try {
    child.send({ job: task.job } satisfies PdfMessage);
  } catch (error) {
    // Something in the job cannot be sent. The child never saw it.
    idle.push(child);
    task.fail(error);
    finish();
  }
}

function takeChild() {
  for (let child = idle.pop(); child; child = idle.pop()) if (child.connected) return child;
  return createChild();
}

function createChild() {
  // Built by vite.pdf.config.ts for production.
  const child = fork(
    resolvePath(import.meta.env.PROD ? 'build/server/pdf-worker.js' : 'app/pdf/worker.tsx'),
    {
      serialization: 'advanced',
      execArgv: [
        `--max-old-space-size=${MAX_HEAP_MB}`,
        ...(import.meta.env.PROD ? [] : ['--import', 'tsx']),
      ],
      // Not those of the database and the sign-in.
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    },
  );
  // An error without listener would end the server. First, because the rest may throw: a child that
  // could not be started has no send().
  child.on('error', () => {});
  // Neither keeps the server running.
  child.unref();
  child.channel?.unref();
  child.on('exit', () => {
    const index = idle.indexOf(child);
    if (index >= 0) idle.splice(index, 1);
  });
  child.send({ fonts: { regular, bold } } satisfies PdfMessage);
  return child;
}
