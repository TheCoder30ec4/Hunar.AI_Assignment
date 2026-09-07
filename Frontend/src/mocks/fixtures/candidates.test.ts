import { describe, expect, it } from 'vitest'

import { candidateSchema } from '@/shared/types/domain'

import { generateCandidates, generateProviderOutcome } from './candidates'
import { createRng } from './random'

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const drawsA = Array.from({ length: 20 }, () => a.next())
    const drawsB = Array.from({ length: 20 }, () => b.next())
    expect(drawsA).toEqual(drawsB)
  })

  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })

  it('stays inside [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('throws rather than returning undefined on an empty pick', () => {
    expect(() => createRng(1).pick([])).toThrow()
  })
})

describe('generateCandidates', () => {
  it('produces byte-identical rows for the same seed', () => {
    expect(generateCandidates({ count: 50, seed: 42 })).toEqual(
      generateCandidates({ count: 50, seed: 42 }),
    )
  })

  it('emits rows that satisfy the domain schema', () => {
    for (const row of generateCandidates({ count: 200, seed: 3 })) {
      expect(candidateSchema.safeParse(row).success).toBe(true)
    }
  })

  it('gives every row a unique id', () => {
    const rows = generateCandidates({ count: 1000, seed: 9 })
    expect(new Set(rows.map((row) => row.id)).size).toBe(1000)
  })

  it('generates the full 10k set for the perf gate', () => {
    expect(generateCandidates({ count: 10_000 })).toHaveLength(10_000)
  })

  it('leaves some records without an email, as real provider data does', () => {
    const rows = generateCandidates({ count: 500, seed: 11 })
    expect(rows.some((row) => row.email === null)).toBe(true)
    expect(rows.some((row) => row.email !== null)).toBe(true)
  })

  it('uses realistic names, not "Candidate 1"', () => {
    for (const row of generateCandidates({ count: 100, seed: 5 })) {
      expect(row.name).not.toMatch(/^Candidate \d+$/)
      expect(row.name).toMatch(/^\S+ \S+/)
    }
  })
})

describe('generateProviderOutcome', () => {
  it('fails exactly one provider and succeeds the rest — the partial state', () => {
    const outcome = generateProviderOutcome()
    expect(outcome.failed).toHaveLength(1)
    // Deliberately not hardcoding the succeeded count against the current
    // provider list length — that number changes independently of this
    // function's actual contract (exactly one failure, everyone else ok).
    expect(outcome.succeeded.length).toBeGreaterThan(0)
    const failedProvider = outcome.failed[0]?.provider
    expect(outcome.succeeded).not.toContain(failedProvider)
  })

  it('gives a human-readable failure reason', () => {
    expect(generateProviderOutcome().failed[0]?.reason).toBeTruthy()
  })
})
