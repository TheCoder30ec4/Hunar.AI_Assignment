import { describe, expect, it } from 'vitest'

import {
  formatCurrency,
  formatDuration,
  formatPercent,
  formatPhone,
  formatRelative,
  formatTimestamp,
} from './format'

describe('formatPhone', () => {
  it('groups an Indian E.164 number', () => {
    expect(formatPhone('+918247350941')).toBe('+91 82473 50941')
  })

  it('groups a US E.164 number', () => {
    expect(formatPhone('+14155550123')).toBe('+1 415 555 0123')
  })

  it('returns non-E.164 input unchanged rather than mangling it', () => {
    expect(formatPhone('080-4567-8901')).toBe('080-4567-8901')
  })

  it('leaves an unrecognised country code alone', () => {
    expect(formatPhone('+4407700900123')).toBe('+4407700900123')
  })
})

describe('formatDuration', () => {
  it('renders under a minute', () => {
    expect(formatDuration(45)).toBe('0:45')
  })

  it('pads seconds', () => {
    expect(formatDuration(93)).toBe('1:33')
  })

  it('adds hours only when needed', () => {
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('renders an em dash for nonsense input', () => {
    expect(formatDuration(-1)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('formatCurrency', () => {
  it('converts minor units to a rupee string', () => {
    // Non-breaking space inside Intl output, so match on the parts.
    const output = formatCurrency(125_050)
    expect(output).toContain('1,250.50')
    expect(output).toContain('₹')
  })
})

describe('formatPercent', () => {
  it('rounds a ratio to a whole percent', () => {
    expect(formatPercent(0.826)).toBe('83%')
    expect(formatPercent(0)).toBe('0%')
  })

  it('guards against infinity', () => {
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-09-06T12:00:00.000Z')

  it('describes the recent past', () => {
    expect(formatRelative('2026-09-06T11:57:00.000Z', now)).toBe('3 minutes ago')
  })

  it('describes the future', () => {
    expect(formatRelative('2026-09-06T14:00:00.000Z', now)).toBe('in 2 hours')
  })

  it('collapses sub-second differences', () => {
    expect(formatRelative('2026-09-06T12:00:00.500Z', now)).toBe('just now')
  })

  it('does not throw on an unparseable timestamp', () => {
    expect(formatRelative('not-a-date', now)).toBe('—')
  })
})

describe('formatTimestamp', () => {
  it('returns an em dash rather than "Invalid Date"', () => {
    expect(formatTimestamp('nonsense')).toBe('—')
  })

  it('renders a fixed-width table-safe string', () => {
    expect(formatTimestamp('2026-09-06T14:32:00.000Z')).toMatch(/^\d{2} \w{3} \d{2}:\d{2}$/)
  })
})
