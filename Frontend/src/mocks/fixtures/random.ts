/**
 * Deterministic PRNG so a 10,000-row fixture is byte-identical across runs.
 * Playwright assertions on row content would flake against Math.random().
 *
 * mulberry32 — 20 lines, no dependency.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  readonly next: () => number
  readonly int: (minInclusive: number, maxExclusive: number) => number
  readonly pick: <T>(items: readonly T[]) => T
  readonly bool: (probability?: number) => boolean
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed)

  const int = (minInclusive: number, maxExclusive: number): number =>
    minInclusive + Math.floor(next() * (maxExclusive - minInclusive))

  const pick = <T,>(items: readonly T[]): T => {
    // noUncheckedIndexedAccess: prove non-empty rather than assert.
    const first = items[0]
    if (first === undefined) throw new Error('pick() called with an empty array')
    return items[int(0, items.length)] ?? first
  }

  return {
    next,
    int,
    pick,
    bool: (probability = 0.5) => next() < probability,
  }
}
