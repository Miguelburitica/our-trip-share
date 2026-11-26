import { validationError } from "../errors";
import { assertUnits } from "./money";

/** FNV-1a 32-bit: a tiny, stable hash used only to break ties deterministically. */
export function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Splits `total` integer units proportionally to integer `weights` using the
 * largest-remainder method. The result always sums exactly to `total`.
 * Ties are broken by stableHash(tieKeys[i]) so the same input gives the same output.
 * Negative totals are allocated on their absolute value and then negated.
 */
export function allocate(total: number, weights: readonly number[], tieKeys: readonly string[]): number[] {
  assertUnits(total, "total");
  if (weights.length === 0) throw validationError("Nothing to allocate to");
  if (weights.length !== tieKeys.length) throw validationError("weights and tieKeys differ in length");
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw validationError("Weights must be non-negative integers");
  }
  const weightSum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (weightSum === 0n) throw validationError("At least one weight must be positive");

  const negative = total < 0;
  const abs = BigInt(Math.abs(total));
  const base: bigint[] = [];
  const remainders: bigint[] = [];
  let assigned = 0n;
  weights.forEach((w) => {
    const product = abs * BigInt(w);
    const q = product / weightSum;
    base.push(q);
    remainders.push(product % weightSum);
    assigned += q;
  });

  let leftover = abs - assigned;
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      if (remainders[a] !== remainders[b]) return remainders[b] > remainders[a] ? 1 : -1;
      const ha = stableHash(tieKeys[a]);
      const hb = stableHash(tieKeys[b]);
      return ha !== hb ? ha - hb : a - b;
    });
  for (const i of order) {
    if (leftover === 0n) break;
    if (remainders[i] === 0n && leftover > 0n && weights[i] === 0) continue;
    base[i] += 1n;
    leftover -= 1n;
  }

  return base.map((b) => {
    const n = Number(b);
    return negative && n !== 0 ? -n : n;
  });
}

/** Equal split: every participant weighs 1. */
export function splitEqually(total: number, tieKeys: readonly string[]): number[] {
  return allocate(total, tieKeys.map(() => 1), tieKeys);
}
