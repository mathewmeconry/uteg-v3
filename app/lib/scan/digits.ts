/**
 * A small convolutional network that tells which digit a handwritten glyph of 28×28 pixels is, as
 * in MNIST: ink is 1, paper 0. Two 3×3 convolutions with max pooling, then two dense layers.
 */

export const GLYPH_SIZE = 28;
export const CHANNELS = [8, 16] as const;
export const HIDDEN = 64;

export type Layer = { weights: Float32Array; bias: Float32Array };
export type DigitModel = { conv1: Layer; conv2: Layer; dense1: Layer; dense2: Layer };

/** Everything a forward pass computes, which training needs to go backwards. */
export type Activations = {
  input: Float32Array;
  conv1: Float32Array;
  pool1: Pooled;
  conv2: Float32Array;
  pool2: Pooled;
  hidden: Float32Array;
  logits: Float32Array;
};
type Pooled = { values: Float32Array; from: Int32Array };

/** The layers' sizes, in the order they are stored. */
export function layerShapes() {
  const flat = CHANNELS[1] * (GLYPH_SIZE / 4) ** 2;
  return {
    conv1: { weights: CHANNELS[0] * 9, bias: CHANNELS[0] },
    conv2: { weights: CHANNELS[1] * CHANNELS[0] * 9, bias: CHANNELS[1] },
    dense1: { weights: HIDDEN * flat, bias: HIDDEN },
    dense2: { weights: 10 * HIDDEN, bias: 10 },
  };
}

export function forward(model: DigitModel, input: Float32Array): Activations {
  const size = GLYPH_SIZE;
  const conv1 = convolve(input, 1, size, model.conv1, CHANNELS[0]);
  const pool1 = pool(conv1, CHANNELS[0], size);
  const conv2 = convolve(pool1.values, CHANNELS[0], size / 2, model.conv2, CHANNELS[1]);
  const pool2 = pool(conv2, CHANNELS[1], size / 2);
  const hidden = dense(pool2.values, model.dense1, HIDDEN);
  for (let index = 0; index < hidden.length; index++) hidden[index] = Math.max(0, hidden[index]);
  const logits = dense(hidden, model.dense2, 10);
  return { input, conv1, pool1, conv2, pool2, hidden, logits };
}

/** The probability of each digit. */
export function classify(model: DigitModel, input: Float32Array) {
  return softmax(forward(model, input).logits);
}

export function softmax(logits: Float32Array) {
  const max = Math.max(...logits);
  const exp = logits.map((value) => Math.exp(value - max));
  const sum = exp.reduce((total, value) => total + value, 0);
  return exp.map((value) => value / sum);
}

/** 3×3 with zero padding, so the size stays, then ReLU. Channels first. */
function convolve(
  input: Float32Array,
  inChannels: number,
  size: number,
  { weights, bias }: Layer,
  outChannels: number,
) {
  const output = new Float32Array(outChannels * size * size);
  for (let out = 0; out < outChannels; out++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = bias[out];
        for (let channel = 0; channel < inChannels; channel++) {
          const kernel = (out * inChannels + channel) * 9;
          const plane = channel * size * size;
          for (let dy = -1; dy <= 1; dy++) {
            const row = y + dy;
            if (row < 0 || row >= size) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const column = x + dx;
              if (column < 0 || column >= size) continue;
              sum += weights[kernel + (dy + 1) * 3 + dx + 1] * input[plane + row * size + column];
            }
          }
        }
        output[(out * size + y) * size + x] = Math.max(0, sum);
      }
    }
  }
  return output;
}

/** 2×2 max pooling. `from` is where each maximum came from. */
function pool(input: Float32Array, channels: number, size: number): Pooled {
  const half = size / 2;
  const values = new Float32Array(channels * half * half);
  const from = new Int32Array(values.length);
  for (let channel = 0; channel < channels; channel++) {
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        let best = -Infinity;
        let at = 0;
        for (const [dy, dx] of [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ]) {
          const index = (channel * size + 2 * y + dy) * size + 2 * x + dx;
          if (input[index] > best) {
            best = input[index];
            at = index;
          }
        }
        const index = (channel * half + y) * half + x;
        values[index] = best;
        from[index] = at;
      }
    }
  }
  return { values, from };
}

/** Weights by output, then input. */
function dense(input: Float32Array, { weights, bias }: Layer, outputs: number) {
  const output = new Float32Array(outputs);
  for (let out = 0; out < outputs; out++) {
    let sum = bias[out];
    const row = out * input.length;
    for (let index = 0; index < input.length; index++) sum += weights[row + index] * input[index];
    output[out] = sum;
  }
  return output;
}

/**
 * Stored as JSON with each array as base64 of signed bytes and a scale, about a quarter of the
 * size of floats and as accurate for this.
 */
type StoredArray = { scale: number; data: string };
export type StoredModel = Record<keyof DigitModel, { weights: StoredArray; bias: StoredArray }>;

export function loadModel(stored: StoredModel): DigitModel {
  const decode = ({ scale, data }: StoredArray) =>
    Float32Array.from(atob(data), (char) => ((char.charCodeAt(0) << 24) >> 24) * scale);
  const layer = ({ weights, bias }: StoredModel[keyof DigitModel]) => ({
    weights: decode(weights),
    bias: decode(bias),
  });
  return {
    conv1: layer(stored.conv1),
    conv2: layer(stored.conv2),
    dense1: layer(stored.dense1),
    dense2: layer(stored.dense2),
  };
}
