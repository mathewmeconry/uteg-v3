import { ChildProcess, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from '~/lib/i18n';
import { NAMESPACES } from '~/locales';
import { readPdf } from '~/tests/pdf';
import { PdfUnavailableError, renderPdf } from './render.server';
import { pdfResponse } from './response.server';
import type { PdfJob } from './worker';

const t = createI18n('de').getFixedT(null, NAMESPACES);

function job(rows: number): Extract<PdfJob, { type: 'starters' }> {
  return {
    type: 'starters',
    language: 'de',
    props: {
      competitionName: 'Gerätecup',
      clubs: [
        {
          id: 'a',
          name: 'TV Chur',
          location: 'Chur',
          rows: Array.from({ length: rows }, (_, index) => ({
            id: String(index),
            firstname: 'Anna',
            lastname: `Frei${index}`,
            birthYear: 2012,
            sex: 'FEMALE',
            category: 'K5',
            divisionNumber: 1,
            apparatus: 'reck',
          })),
        },
      ],
    },
  };
}

const small = job(1);
const large = job(2000);

describe('renderPdf', () => {
  it('renders', async () => {
    expect((await readPdf(await renderPdf(small)))[0].text).toContain('Frei0 Anna');
  });

  it('does not block the event loop', async () => {
    const pdf = renderPdf(job(300));
    let last = performance.now();
    let longest = 0;
    const interval = setInterval(() => {
      longest = Math.max(longest, performance.now() - last);
      last = performance.now();
    }, 5);
    await pdf;
    clearInterval(interval);
    expect(longest).toBeLessThan(300);
  });

  it('gives up after the time limit, ends the process and works afterwards', async () => {
    const kill = vi.spyOn(ChildProcess.prototype, 'kill');
    await expect(renderPdf(large, { timeoutMs: 50 })).rejects.toThrow(PdfUnavailableError);
    expect(kill).toHaveBeenCalledOnce();
    const child = kill.mock.contexts[0] as ChildProcess;
    expect(await once(child, 'exit')).toEqual([null, 'SIGKILL']);
    kill.mockRestore();
    expect((await renderPdf(small)).length).toBeGreaterThan(0);
  });

  it('survives a process that aborts, as when it runs out of memory', async () => {
    const result = expect(renderPdf(large)).rejects.toThrow('The process ended with SIGABRT');
    const pids = execFileSync('pgrep', ['-P', String(process.pid), '-f', 'pdf/worker'], {
      encoding: 'utf8',
    });
    for (const pid of pids.trim().split('\n')) process.kill(Number(pid), 'SIGABRT');
    await result;
    expect((await renderPdf(small)).length).toBeGreaterThan(0);
  });

  it('limits the heap of the process', async () => {
    const strings = Array.from({ length: 400_000 }, (_, index) => ({
      ...job(1).props.clubs[0].rows[0],
      id: `${index}`,
    }));
    const clubs = [{ ...job(1).props.clubs[0], rows: strings }];
    const huge = { ...small, props: { competitionName: 'X', clubs } } as PdfJob;
    await expect(renderPdf(huge, { timeoutMs: 60_000 })).rejects.toThrow(/ended with/);
    expect((await renderPdf(small)).length).toBeGreaterThan(0);
  }, 70_000);

  it('counts waiting as time, and rejects waiting tasks at once when aborted', async () => {
    const controller = new AbortController();
    const { signal } = controller;
    const running = Promise.allSettled([1, 2].map(() => renderPdf(large, { signal })));
    await expect(renderPdf(small, { timeoutMs: 20 })).rejects.toThrow('Timeout');

    const own = new AbortController();
    const waiting = renderPdf(small, { signal: own.signal });
    let isRejected = false;
    const settled = waiting.catch(() => {
      isRejected = true;
    });
    own.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(isRejected).toBe(true);
    controller.abort();
    await Promise.all([settled, running]);
    expect((await renderPdf(small)).length).toBeGreaterThan(0);
  });

  it('survives a crashing worker', async () => {
    // Not a job, the worker fails outside of its error handling.
    await expect(renderPdf(null as unknown as PdfJob)).rejects.toThrow(PdfUnavailableError);
    expect((await renderPdf(small)).length).toBeGreaterThan(0);
  });

  it('rejects what cannot be sent to a worker', async () => {
    const broken = { ...small, props: { clubs: () => [] } } as unknown as PdfJob;
    await expect(renderPdf(broken)).rejects.toThrow(/could not be cloned/);
    expect((await renderPdf(small)).length).toBeGreaterThan(0);
  });

  it('stops rendering and waiting when aborted', async () => {
    const controller = new AbortController();
    const aborted = Array.from({ length: 6 }, () =>
      renderPdf(large, { signal: controller.signal }),
    );
    setTimeout(() => controller.abort(), 20);
    const results = await Promise.allSettled(aborted);
    expect(results.every(({ status }) => status === 'rejected')).toBe(true);
    expect((await renderPdf(small)).length).toBeGreaterThan(0);
    await expect(renderPdf(small, { signal: controller.signal })).rejects.toThrow();
  });

  it('refuses more than fit in the queue', async () => {
    const controller = new AbortController();
    const all = Array.from({ length: 30 }, () => renderPdf(large, { signal: controller.signal }));
    const settled = Promise.allSettled(all);
    await expect(all.at(-1)).rejects.toThrow(PdfUnavailableError);
    controller.abort();
    await settled;
  });

  it('reports errors of a document', async () => {
    const broken = { ...small, props: {} } as unknown as PdfJob;
    await expect(renderPdf(broken)).rejects.toThrow(/TypeError/);
  });
});

describe('pdfResponse', () => {
  it('explains why there is no PDF', async () => {
    const controller = new AbortController();
    const { signal } = controller;
    const all = Array.from({ length: 22 }, () => renderPdf(large, { signal }));
    const settled = Promise.allSettled(all);
    const response = await pdfResponse(small, { name: 'x', signal, t });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('konnte nicht erstellt werden');
    controller.abort();
    await settled;
  });
});

describe('starter list', () => {
  it('has one header per page and starts a new section after 150 rows', async () => {
    const pages = await readPdf(await renderPdf(job(160)));
    for (const { text } of pages) expect(text.match(/Startgerät/g)).toHaveLength(1);
    const last = pages.at(-1)!.text;
    expect(last).toContain(`${pages.length} / ${pages.length}`);
    expect(last).toContain('Frei150 ');
    expect(last).not.toContain('Frei149 ');
  });

  it('keeps the club, the table header and the first row together', async () => {
    for (let rows = 34; rows < 48; rows++) {
      const first = job(rows);
      const [club] = (first.props as { clubs: object[] }).clubs;
      const second = { ...job(3), language: 'de' } as PdfJob;
      const [other] = (second.props as { clubs: any[] }).clubs;
      const clubs = [club, { ...other, id: 'b', name: 'Getu Zug' }];
      const pages = await readPdf(
        await renderPdf({ ...first, props: { competitionName: 'X', clubs } } as PdfJob),
      );
      const page = pages.find(({ text }) => text.includes('Getu Zug'))!;
      expect(page.text, `${rows} rows`).toMatch(/Getu Zug.*Startgerät.*Frei0/);
    }
  }, 30_000);
});
