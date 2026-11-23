import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfJob } from './worker';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, fork: vi.fn(original.fork) };
});

const row = {
  firstname: 'Anna',
  lastname: 'Frei',
  birthYear: 2012,
  sex: 'FEMALE',
  category: 'K5',
  divisionNumber: 1,
  apparatus: 'reck',
} as const;

function job(rows: number): PdfJob {
  return {
    type: 'starters',
    language: 'de',
    props: {
      competitionName: 'X',
      clubs: [
        {
          id: 'a',
          name: 'A',
          location: 'A',
          rows: Array.from({ length: rows }, (_, index) => ({ ...row, id: String(index) })),
        },
      ],
    },
  };
}

/** What fork returns with EMFILE: without handle and channel, the error follows. */
function createUnstarted() {
  const child = Object.assign(new EventEmitter(), {
    connected: false,
    unref() {},
    kill: () => false,
  });
  process.nextTick(() => child.emit('error', new Error('spawn EMFILE')));
  return child as unknown as ChildProcess;
}

const failures = [
  [
    'throws',
    () => {
      throw new Error('EMFILE');
    },
  ],
  ['cannot start the process', createUnstarted],
] as const;

// Without children of other tests.
beforeEach(() => vi.resetModules());

describe.each(failures)('when fork %s', (_name, fail) => {
  it('rejects, and the next job works', async () => {
    const { renderPdf } = await import('./render.server');
    vi.mocked(fork).mockImplementationOnce(fail);
    await expect(renderPdf(job(1))).rejects.toMatchObject({ name: 'PdfUnavailableError' });
    expect((await renderPdf(job(1))).length).toBeGreaterThan(0);
  });

  it('rejects what waited for the exit of another one', async () => {
    const { renderPdf } = await import('./render.server');
    const controller = new AbortController();
    const running = Promise.allSettled(
      [1, 2].map(() => renderPdf(job(2000), { signal: controller.signal })),
    );
    const waiting = expect(renderPdf(job(1))).rejects.toMatchObject({
      name: 'PdfUnavailableError',
    });
    vi.mocked(fork).mockImplementationOnce(fail);
    controller.abort();
    await Promise.all([running, waiting]);
    expect((await renderPdf(job(1))).length).toBeGreaterThan(0);
  });
});
