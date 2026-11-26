import type { ScanResult } from './scan.worker';

export type { ScanResult };

let worker: Worker | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve: (result: ScanResult) => void; reject: () => void }>();

/**
 * Reads a photo of a page of the judging sheets and keeps its grades on the server, for an editor
 * to check. In a worker, which is started with the first photo, so the page stays responsive.
 */
export function scanPhoto(competitionId: string, photo: Blob) {
  worker ??= start();
  const id = nextId++;
  return new Promise<ScanResult>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, competitionId, photo });
  });
}

function start() {
  const started = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
  started.onmessage = ({
    data: { id, result },
  }: MessageEvent<{ id: number; result?: ScanResult }>) => {
    const answer = waiting.get(id);
    waiting.delete(id);
    if (result) answer?.resolve(result);
    else answer?.reject();
  };
  // It could not be loaded, e.g. offline: the next photo starts it again.
  started.onerror = () => {
    for (const { reject } of waiting.values()) reject();
    waiting.clear();
    worker = undefined;
  };
  return started;
}
