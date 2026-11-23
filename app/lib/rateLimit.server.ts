/** Counts calls per key in memory. Returns whether another one is allowed. */
export function createRateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const counters = new Map<string, { count: number; endsAt: number }>();

  return (key: string) => {
    const now = Date.now();
    for (const [other, { endsAt }] of counters) if (endsAt <= now) counters.delete(other);
    const counter = counters.get(key) ?? { count: 0, endsAt: now + windowMs };
    counters.set(key, counter);
    return ++counter.count <= max;
  };
}
