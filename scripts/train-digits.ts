/**
 * Trains the digit model of the sheet scan and writes app/lib/scan/digitModel.json.
 *
 *   pnpm train:digits <folder with the four MNIST .gz files> [options]
 *
 *   --cells <folder>  cells cut out by findPage as <name>.pgm, with labels.csv of "name,grade"
 *                     lines. Their digits are learnt as well, many times as often as MNIST's.
 *                     Can be given several times.
 *   --from <file>     a model to go on training, instead of starting anew
 *   --epochs <n>      8 by default
 *   --out <file>      where to write the model
 *
 * The digits go through the same glyph normalisation as cells of photos, turned, slanted, sized
 * and with strokes as thin or thick as pens write them. Decimal commas and points are drawn, as
 * MNIST has none, and taken from the cells where one stands between the digits.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import {
  CHANNELS,
  forward,
  GLYPH_SIZE,
  HIDDEN,
  layerShapes,
  loadModel,
  SEPARATOR,
  softmax,
  type Activations,
  type DigitModel,
  type Layer,
  type Shape,
  type StoredModel,
} from '../app/lib/scan/digits';
import { glyphOf, segment, shapes } from '../app/lib/scan/grade';

const BATCH = 64;
const LEARNING_RATE = 0.002;
/** Digits are drawn this many times larger before they are normalised, like a photo's cell. */
const UPSCALE = 3;
/** How often each digit of a real cell is learnt per epoch: they are few, but what counts. */
const REAL_REPEAT = 20;
/** How far a glyph is warped at most, in pixels of 28×28, and over how many squares. */
const WARP = 1.5;
const WARP_GRID = 4;
/** Drawn commas and points per epoch, about as many as each digit of MNIST. */
const DRAWN_SEPARATORS = 6000;

/** An MNIST image, or none for a drawn separator. Without a shape, one is made up. */
type Sample = { image: Uint8Array | null; label: number; shape?: Shape };

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cells: { type: 'string', multiple: true, default: [] },
    from: { type: 'string' },
    epochs: { type: 'string', default: '8' },
    out: { type: 'string' },
  },
});
const folder = positionals[0];
if (!folder) throw new Error('Usage: pnpm train:digits <folder with the MNIST files> [options]');

const random = seeded(1);
const train = load('train');
const test = load('t10k');
const real = options.cells.flatMap(loadCells);
const samples: Sample[] = [
  ...Array.from(train.labels, (label, index) => ({ image: train.image(index), label })),
  ...Array.from({ length: REAL_REPEAT }, () => real).flat(),
  ...Array.from({ length: DRAWN_SEPARATORS }, () => ({ image: null, label: SEPARATOR })),
];
const separators = real.filter(({ label }) => label === SEPARATOR).length;
process.stdout.write(`${real.length - separators} digits and ${separators} commas of real cells\n`);
const model = options.from
  ? loadModel(JSON.parse(readFileSync(options.from, 'utf8')))
  : initialise();
const optimiser = adam(model);

for (let epoch = 0; epoch < Number(options.epochs); epoch++) {
  const started = Date.now();
  const order = shuffle(Array.from(samples.keys()));
  // Going on from a model needs smaller steps, so it keeps what it knows.
  const rate = (options.from ? LEARNING_RATE / 4 : LEARNING_RATE) * 0.75 ** epoch;
  let loss = 0;
  for (let start = 0; start < order.length; start += BATCH) {
    const gradients = zeros();
    for (const index of order.slice(start, start + BATCH)) {
      const { image, label, shape } = samples[index];
      const [glyph, drawnShape] = image ? [augment(image), digitShape()] : drawSeparator();
      loss += backward(model, forward(model, glyph, shape ?? drawnShape), label, gradients);
    }
    optimiser.step(gradients, Math.min(BATCH, order.length - start), rate);
  }
  process.stdout.write(
    `epoch ${epoch + 1}: loss ${(loss / order.length).toFixed(4)}, test ${(accuracy() * 100).toFixed(2)}%, ${Math.round((Date.now() - started) / 1000)}s\n`,
  );
}

const path = options.out ?? new URL('../app/lib/scan/digitModel.json', import.meta.url).pathname;
writeFileSync(path, `${JSON.stringify(store(model))}\n`);
process.stdout.write(`Written to ${path}\n`);

function load(name: 'train' | 't10k') {
  const images = gunzipSync(readFileSync(join(folder!, `${name}-images-idx3-ubyte.gz`)));
  const labels = gunzipSync(readFileSync(join(folder!, `${name}-labels-idx1-ubyte.gz`)));
  const size = GLYPH_SIZE * GLYPH_SIZE;
  return {
    labels: labels.subarray(8),
    image: (index: number) => images.subarray(16 + index * size, 16 + (index + 1) * size),
  };
}

/**
 * The digits of labelled cells as MNIST images. Only cells split into as many pieces as their
 * grade has digits, so each digit gets its label, or one more without a point: then the piece
 * where the point belongs is a comma.
 */
function loadCells(cells: string): Sample[] {
  return readFileSync(join(cells, 'labels.csv'), 'utf8')
    .trim()
    .split('\n')
    .flatMap((line) => {
      const [name, grade] = line.split(',');
      const pgm = readFileSync(join(cells, `${name}.pgm`));
      const [header, width, height] = pgm
        .toString('latin1', 0, 32)
        .match(/^P5\s+(\d+)\s+(\d+)\s+255\s/)!;
      const cell = {
        width: Number(width),
        height: Number(height),
        data: new Uint8Array(pgm.subarray(header.length)),
      };
      const digitLabels = grade.replace(/\D/g, '').split('').map(Number);
      const whole = grade.split('.')[0].length;
      const { ink, width: inkWidth, digits, point } = segment(cell);
      const labels =
        digits.length === digitLabels.length + 1 && point === null && whole < digitLabels.length
          ? digitLabels.toSpliced(whole, 0, SEPARATOR)
          : digitLabels;
      if (digits.length !== labels.length) return [];
      const shapeOf = shapes(digits);
      return digits.map((group, index) => {
        const mask = new Uint8Array(ink.length);
        for (const blob of group) for (const pixel of blob.pixels) mask[pixel] = 1;
        const glyph = glyphOf(mask, inkWidth);
        return {
          image: Uint8Array.from(glyph, (value) => Math.round(value * 255)),
          label: labels[index],
          shape: shapeOf(group),
        };
      });
    });
}

/** Accuracy on the test digits, upright but normalised like a photo's. */
function accuracy() {
  let correct = 0;
  for (let index = 0; index < test.labels.length; index++) {
    const { logits } = forward(model, augment(test.image(index), false), [1, 0]);
    if (logits.indexOf(Math.max(...logits)) === test.labels[index]) correct++;
  }
  return correct / test.labels.length;
}

/** The digit drawn larger, maybe turned and slanted, with thinner or thicker strokes. */
function augment(image: Uint8Array, vary = true) {
  const size = GLYPH_SIZE * UPSCALE;
  const angle = vary ? (random() - 0.5) * 0.4 : 0;
  const slant = vary ? (random() - 0.5) * 0.6 : 0;
  const stretch = vary ? 0.8 + random() * 0.4 : 1;
  // Where the pixel value counts as ink: high gives thin strokes, low thick ones.
  const threshold = vary ? 0.15 + random() * 0.6 : 0.4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bend = vary ? warp() : () => [0, 0];
  const ink = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / UPSCALE;
      const dy = (y - size / 2) / UPSCALE;
      const sourceX = (cos * dx + sin * dy - slant * dy) * stretch + GLYPH_SIZE / 2;
      const sourceY = -sin * dx + cos * dy + GLYPH_SIZE / 2;
      const [bendX, bendY] = bend(sourceX, sourceY);
      const value = sample(image, sourceX + bendX, sourceY + bendY) / 255;
      ink[y * size + x] = Math.min(1, Math.max(0, (value - threshold) / 0.2));
    }
  }
  return glyphOf(ink, size);
}

/**
 * A smooth random warp of a glyph, as the same hand writes a digit a bit differently each time:
 * offsets in pixels of 28×28 on a coarse grid, and in between them interpolated.
 */
function warp() {
  const offsets = Array.from({ length: (WARP_GRID + 1) ** 2 }, () => [
    (random() * 2 - 1) * WARP,
    (random() * 2 - 1) * WARP,
  ]);
  return (x: number, y: number) => {
    const gridX = Math.min(WARP_GRID - 1e-6, Math.max(0, (x / GLYPH_SIZE) * WARP_GRID));
    const gridY = Math.min(WARP_GRID - 1e-6, Math.max(0, (y / GLYPH_SIZE) * WARP_GRID));
    const [left, top] = [Math.floor(gridX), Math.floor(gridY)];
    const [fx, fy] = [gridX - left, gridY - top];
    const at = (column: number, row: number) => offsets[row * (WARP_GRID + 1) + column];
    return [0, 1].map(
      (axis) =>
        (at(left, top)[axis] * (1 - fx) + at(left + 1, top)[axis] * fx) * (1 - fy) +
        (at(left, top + 1)[axis] * (1 - fx) + at(left + 1, top + 1)[axis] * fx) * fy,
    );
  };
}

/** A digit in a cell: nearly as tall as the tallest there, decimals sometimes a bit smaller. */
function digitShape(): Shape {
  const height = 0.7 + random() * 0.3;
  return [height, random() * (1 - height)];
}

/**
 * A decimal comma, a stroke leaning to the lower left, sometimes curved, or a point, as a glyph
 * and with its shape: short, and low down, a comma reaching below the digits.
 */
function drawSeparator(): [Float32Array, Shape] {
  const size = GLYPH_SIZE * UPSCALE;
  const ink = new Float32Array(size * size);
  const isPoint = random() < 0.3;
  const thickness = 2 + random() * 5;
  // From the top end to the bottom end, curving to the left on the way down.
  const length = isPoint ? 0 : 20 + random() * 50;
  const lean = random() * 0.8;
  const curve = random() * 0.5;
  const from = { x: size / 2 + (lean * length) / 2, y: size / 2 - length / 2 };
  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    const x = from.x - lean * length * t - curve * length * t * t;
    const y = from.y + length * t;
    for (let dy = -thickness; dy <= thickness; dy++) {
      for (let dx = -thickness; dx <= thickness; dx++) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (dx * dx + dy * dy > thickness * thickness) continue;
        if (px >= 0 && py >= 0 && px < size && py < size) ink[py * size + px] = 1;
      }
    }
  }
  const shape: Shape = isPoint
    ? [0.08 + random() * 0.17, 0.7 + random() * 0.3]
    : [0.2 + random() * 0.45, 0.45 + random() * 0.45];
  return [glyphOf(ink, size), shape];
}

function sample(image: Uint8Array, x: number, y: number) {
  const left = Math.floor(x - 0.5);
  const top = Math.floor(y - 0.5);
  const fx = x - 0.5 - left;
  const fy = y - 0.5 - top;
  const at = (column: number, row: number) =>
    column < 0 || row < 0 || column >= GLYPH_SIZE || row >= GLYPH_SIZE
      ? 0
      : image[row * GLYPH_SIZE + column];
  return (
    (at(left, top) * (1 - fx) + at(left + 1, top) * fx) * (1 - fy) +
    (at(left, top + 1) * (1 - fx) + at(left + 1, top + 1) * fx) * fy
  );
}

/** Adds the gradients of the cross-entropy loss for one glyph, returns the loss. */
function backward(model: DigitModel, a: Activations, label: number, g: DigitModel) {
  const probabilities = softmax(a.logits);
  const dLogits = probabilities.map((p, digit) => p - (digit === label ? 1 : 0));

  const dHidden = denseBackward(a.hidden, dLogits, model.dense2, g.dense2);
  for (let index = 0; index < HIDDEN; index++) if (a.hidden[index] <= 0) dHidden[index] = 0;

  // The shape at the end of the features has no layer below to go back to.
  const dFeatures = denseBackward(a.features, dHidden, model.dense1, g.dense1);
  const dPool2 = dFeatures.subarray(0, a.pool2.values.length);
  const dConv2 = unpool(dPool2, a.pool2.from, a.conv2);
  const dPool1 = convolveBackward(
    a.pool1.values,
    CHANNELS[0],
    GLYPH_SIZE / 2,
    dConv2,
    model.conv2,
    g.conv2,
  );
  const dConv1 = unpool(dPool1, a.pool1.from, a.conv1);
  convolveBackward(a.input, 1, GLYPH_SIZE, dConv1, model.conv1, g.conv1);

  return -Math.log(Math.max(probabilities[label], 1e-9));
}

function denseBackward(input: Float32Array, dOutput: Float32Array, layer: Layer, g: Layer) {
  const dInput = new Float32Array(input.length);
  for (let out = 0; out < dOutput.length; out++) {
    const d = dOutput[out];
    g.bias[out] += d;
    const row = out * input.length;
    for (let index = 0; index < input.length; index++) {
      g.weights[row + index] += d * input[index];
      dInput[index] += d * layer.weights[row + index];
    }
  }
  return dInput;
}

/** Back to the maxima the pooling took, and through the ReLU before it. */
function unpool(dPooled: Float32Array, from: Int32Array, activated: Float32Array) {
  const d = new Float32Array(activated.length);
  for (let index = 0; index < dPooled.length; index++) {
    if (activated[from[index]] > 0) d[from[index]] += dPooled[index];
  }
  return d;
}

function convolveBackward(
  input: Float32Array,
  inChannels: number,
  size: number,
  dOutput: Float32Array,
  layer: Layer,
  g: Layer,
) {
  const dInput = new Float32Array(input.length);
  const outChannels = layer.bias.length;
  for (let out = 0; out < outChannels; out++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = dOutput[(out * size + y) * size + x];
        if (d === 0) continue;
        g.bias[out] += d;
        for (let channel = 0; channel < inChannels; channel++) {
          const kernel = (out * inChannels + channel) * 9;
          const plane = channel * size * size;
          for (let dy = -1; dy <= 1; dy++) {
            const row = y + dy;
            if (row < 0 || row >= size) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const column = x + dx;
              if (column < 0 || column >= size) continue;
              const k = kernel + (dy + 1) * 3 + dx + 1;
              const i = plane + row * size + column;
              g.weights[k] += d * input[i];
              dInput[i] += d * layer.weights[k];
            }
          }
        }
      }
    }
  }
  return dInput;
}

/** He initialisation, as the layers are followed by ReLU. */
function initialise(): DigitModel {
  const shapes = layerShapes();
  const fanIn = {
    conv1: 9,
    conv2: CHANNELS[0] * 9,
    dense1: shapes.dense1.weights / HIDDEN,
    dense2: HIDDEN,
  };
  const layer = (name: keyof DigitModel) => ({
    weights: Float32Array.from(
      { length: shapes[name].weights },
      () => normal() * Math.sqrt(2 / fanIn[name]),
    ),
    bias: new Float32Array(shapes[name].bias),
  });
  return {
    conv1: layer('conv1'),
    conv2: layer('conv2'),
    dense1: layer('dense1'),
    dense2: layer('dense2'),
  };
}

function zeros(): DigitModel {
  const shapes = layerShapes();
  const layer = (name: keyof DigitModel) => ({
    weights: new Float32Array(shapes[name].weights),
    bias: new Float32Array(shapes[name].bias),
  });
  return {
    conv1: layer('conv1'),
    conv2: layer('conv2'),
    dense1: layer('dense1'),
    dense2: layer('dense2'),
  };
}

function adam(model: DigitModel) {
  const arrays = (m: DigitModel) =>
    Object.values(m).flatMap(({ weights, bias }: Layer) => [weights, bias]);
  const parameters = arrays(model);
  const first = parameters.map((array) => new Float32Array(array.length));
  const second = parameters.map((array) => new Float32Array(array.length));
  let steps = 0;
  return {
    step(gradients: DigitModel, count: number, rate: number) {
      steps++;
      const correction1 = 1 - 0.9 ** steps;
      const correction2 = 1 - 0.999 ** steps;
      for (const [index, gradient] of arrays(gradients).entries()) {
        const parameter = parameters[index];
        for (let i = 0; i < parameter.length; i++) {
          const value = gradient[i] / count;
          first[index][i] = 0.9 * first[index][i] + 0.1 * value;
          second[index][i] = 0.999 * second[index][i] + 0.001 * value * value;
          parameter[i] -=
            (rate * (first[index][i] / correction1)) /
            (Math.sqrt(second[index][i] / correction2) + 1e-8);
        }
      }
    },
  };
}

function store(model: DigitModel): StoredModel {
  const quantise = (array: Float32Array) => {
    const scale = Math.max(...array.map(Math.abs)) / 127 || 1;
    const bytes = Uint8Array.from(array, (value) => Math.round(value / scale) & 0xff);
    return { scale, data: Buffer.from(bytes).toString('base64') };
  };
  const layer = ({ weights, bias }: Layer) => ({
    weights: quantise(weights),
    bias: quantise(bias),
  });
  return {
    conv1: layer(model.conv1),
    conv2: layer(model.conv2),
    dense1: layer(model.dense1),
    dense2: layer(model.dense2),
  };
}

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function normal() {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/** Mulberry32, so a training gives the same model again. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
