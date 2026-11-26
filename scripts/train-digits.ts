/**
 * Trains the digit model of the sheet scan on MNIST and writes app/lib/scan/digitModel.json.
 *
 *   pnpm train:digits <folder with the four MNIST .gz files>
 *
 * The digits go through the same glyph normalisation as cells of photos, turned, slanted, sized
 * and with strokes as thin or thick as pens write them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  CHANNELS,
  forward,
  GLYPH_SIZE,
  HIDDEN,
  layerShapes,
  softmax,
  type Activations,
  type DigitModel,
  type Layer,
  type StoredModel,
} from '../app/lib/scan/digits';
import { glyphOf } from '../app/lib/scan/grade';

const EPOCHS = 8;
const BATCH = 64;
const LEARNING_RATE = 0.002;
/** Digits are drawn this many times larger before they are normalised, like a photo's cell. */
const UPSCALE = 3;

const folder = process.argv[2];
if (!folder) throw new Error('Usage: pnpm train:digits <folder with the MNIST files>');

const random = seeded(1);
const train = load('train');
const test = load('t10k');
const model = initialise();
const optimiser = adam(model);

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const started = Date.now();
  const order = shuffle(Array.from(train.labels.keys()));
  const rate = LEARNING_RATE * 0.75 ** epoch;
  let loss = 0;
  for (let start = 0; start < order.length; start += BATCH) {
    const gradients = zeros();
    for (const index of order.slice(start, start + BATCH)) {
      const activations = forward(model, augment(train.image(index)));
      loss += backward(model, activations, train.labels[index], gradients);
    }
    optimiser.step(gradients, Math.min(BATCH, order.length - start), rate);
  }
  process.stdout.write(
    `epoch ${epoch + 1}: loss ${(loss / order.length).toFixed(4)}, test ${(accuracy() * 100).toFixed(2)}%, ${Math.round((Date.now() - started) / 1000)}s\n`,
  );
}

const path = new URL('../app/lib/scan/digitModel.json', import.meta.url);
writeFileSync(path, `${JSON.stringify(store(model))}\n`);
process.stdout.write(`Written to ${path.pathname}\n`);

function load(name: 'train' | 't10k') {
  const images = gunzipSync(readFileSync(join(folder!, `${name}-images-idx3-ubyte.gz`)));
  const labels = gunzipSync(readFileSync(join(folder!, `${name}-labels-idx1-ubyte.gz`)));
  const size = GLYPH_SIZE * GLYPH_SIZE;
  return {
    labels: labels.subarray(8),
    image: (index: number) => images.subarray(16 + index * size, 16 + (index + 1) * size),
  };
}

/** Accuracy on the test digits, upright but normalised like a photo's. */
function accuracy() {
  let correct = 0;
  for (let index = 0; index < test.labels.length; index++) {
    const { logits } = forward(model, augment(test.image(index), false));
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
  const ink = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / UPSCALE;
      const dy = (y - size / 2) / UPSCALE;
      const sourceX = (cos * dx + sin * dy - slant * dy) * stretch + GLYPH_SIZE / 2;
      const sourceY = -sin * dx + cos * dy + GLYPH_SIZE / 2;
      const value = sample(image, sourceX, sourceY) / 255;
      ink[y * size + x] = Math.min(1, Math.max(0, (value - threshold) / 0.2));
    }
  }
  return glyphOf(ink, size);
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

  const dPool2 = denseBackward(a.pool2.values, dHidden, model.dense1, g.dense1);
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
