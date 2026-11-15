/** Mulberry32. Zero is a valid seed/state. Exactly one uint32 step per draw. */
export function nextRandom(state: number): { state: number; value: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: next, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
export function normalizeSeed(seed: number): number {
  if (!Number.isSafeInteger(seed)) throw new Error('seed: expected a safe integer');
  return seed >>> 0;
}
