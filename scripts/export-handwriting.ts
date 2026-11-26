/**
 * Writes the kept handwriting of judging sheets in the form `pnpm train:digits --cells` reads:
 * a `<id>.pgm` for each cell and `labels.csv`. See HandwritingSample.
 *
 *   pnpm export:handwriting <folder> [--competition <id>]
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { listHandwritingSamples } from '~/lib/handwriting.server';
import { prisma } from '~/lib/prisma.server';

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: { competition: { type: 'string' } },
});
const folder = positionals[0];
if (!folder) throw new Error('Usage: pnpm export:handwriting <folder> [--competition <id>]');

async function main() {
  const samples = await listHandwritingSamples(options.competition);
  mkdirSync(folder!, { recursive: true });
  for (const { id, image } of samples) {
    const header = Buffer.from(`P5 ${image.width} ${image.height} 255\n`);
    writeFileSync(join(folder!, `${id}.pgm`), Buffer.concat([header, image.data]));
  }
  const labels = samples.map(({ id, written }) => `${id},${written}\n`).join('');
  writeFileSync(join(folder!, 'labels.csv'), labels);
  const misread = samples.filter(({ isRead }) => !isRead).length;
  process.stdout.write(`${samples.length} cells, ${misread} of them misread, in ${folder}\n`);
}

await main().finally(() => prisma.$disconnect());
