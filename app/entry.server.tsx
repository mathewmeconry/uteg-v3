import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import {
  ServerRouter,
  type EntryContext,
  type HandleErrorFunction,
  type RouterContextProvider,
} from 'react-router';
import { closeEventStreams } from '~/lib/events.server';
import { logger } from '~/lib/logger.server';
import { getI18n } from '~/middlewares/i18n.server';

export const streamTimeout = 10_000;

const SHUTDOWN_MS = 5_000;

// react-router-serve stops listening at these signals, but then waits for every open connection.
if (import.meta.env.PROD) {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      closeEventStreams();
      setTimeout(() => process.exit(0), SHUTDOWN_MS).unref();
    });
  }
}

export const handleError: HandleErrorFunction = (error, { request }) => {
  if (request.signal.aborted) return;
  const status = error && typeof error === 'object' && 'status' in error ? error.status : 500;
  if (typeof status === 'number' && status < 500) return;
  logger.error({ err: error, method: request.method }, 'Request failed');
};

export default function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  entryContext: EntryContext,
  routerContext: RouterContextProvider,
) {
  if (request.method === 'HEAD') return new Response(null, { status, headers });

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const readyEvent = isbot(request.headers.get('User-Agent')) ? 'onAllReady' : 'onShellReady';

    const { pipe, abort } = renderToPipeableStream(
      <I18nextProvider i18n={getI18n(routerContext)}>
        <ServerRouter context={entryContext} url={request.url} />
      </I18nextProvider>,
      {
        [readyEvent]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeout);
              callback();
            },
          });
          headers.set('Content-Type', 'text/html; charset=utf-8');
          resolve(new Response(createReadableStreamFromReadable(body), { headers, status }));
          pipe(body);
        },
        onShellError(error) {
          clearTimeout(timeout);
          reject(error);
        },
        onError(error) {
          status = 500;
          // Shell errors are rejected above and logged by handleError.
          if (shellRendered) logger.error({ err: error }, 'Rendering failed');
        },
      },
    );
    const timeout = setTimeout(abort, streamTimeout + 1000);
  });
}
