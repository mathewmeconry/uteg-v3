import type { Point } from '~/lib/judgingSheet';
import type { ScanResult } from './scan.worker';

export type { ScanResult };

type Answer = { result?: ScanResult; corners?: Point[] | null };

let worker: Worker | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve: (answer: Answer) => void; reject: () => void }>();

/**
 * Reads a photo of a page of the judging sheets and keeps its grades on the server, for an editor
 * to check. In a worker, which is started with the first photo, so the page stays responsive.
 */
export async function scanPhoto(competitionId: string, photo: Blob) {
  const { result } = await ask({ competitionId, photo });
  if (!result) throw new Error('Not read');
  return result;
}

/** Where the corners of a sheet are in a frame of the camera, or null without one. */
export async function locatePage(frame: ImageData) {
  const { corners } = await ask({ frame }, [frame.data.buffer]);
  return corners ?? null;
}

function ask(message: object, transfer: Transferable[] = []) {
  worker ??= start();
  const id = nextId++;
  return new Promise<Answer>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, ...message }, transfer);
  });
}

function start() {
  const started = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
  started.onmessage = ({ data: { id, ...answer } }: MessageEvent<Answer & { id: number }>) => {
    waiting.get(id)?.resolve(answer);
    waiting.delete(id);
  };
  // It could not be loaded, e.g. offline: the next photo starts a new one.
  started.onerror = () => {
    started.terminate();
    for (const { reject } of waiting.values()) reject();
    waiting.clear();
    worker = undefined;
  };
  return started;
}
