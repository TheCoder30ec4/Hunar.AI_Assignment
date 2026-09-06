import type { CallStatus, Candidate, Provider } from '@/shared/types/domain'

import { createRng } from './random'

/* Realistic Indian and international names, Bengaluru-area employers and titles.
   No "Candidate 1", no lorem ipsum — the table has to look like production. */

const FIRST_NAMES = [
  'Priya', 'Arjun', 'Fatima', 'Rahul', 'Ananya', 'Vikram', 'Sneha', 'Karthik',
  'Divya', 'Rohan', 'Meera', 'Aditya', 'Kavya', 'Siddharth', 'Nisha', 'Aravind',
  'Lakshmi', 'Harsha', 'Ritu', 'Manoj', 'Shreya', 'Nikhil', 'Pooja', 'Varun',
  'Aisha', 'Sanjay', 'Deepika', 'Rajesh', 'Tanvi', 'Abhishek',
  'Sarah', 'Michael', 'Elena', 'David', 'Yuki', 'Thomas', 'Grace', 'Daniel',
] as const

const LAST_NAMES = [
  'Raghunathan', 'Menon', 'Sheikh', 'Iyer', 'Reddy', 'Nair', 'Desai', 'Krishnan',
  'Bhat', 'Chandrasekhar', 'Pillai', 'Rao', 'Subramanian', 'Kulkarni', 'Joshi',
  'Varma', 'Shetty', 'Gowda', 'Patel', 'Mukherjee', 'Banerjee', 'Kapoor',
  'Srinivasan', 'Venkatesh', 'Hegde', 'Prabhu', 'Naidu', 'Chatterjee',
  'Okonkwo', 'Lindqvist', 'Tanaka', "O'Brien", 'Fernandes', 'Castillo',
] as const

const TITLES = [
  'Senior Backend Engineer', 'Staff Software Engineer', 'Engineering Manager',
  'Principal Engineer', 'Full Stack Developer', 'Site Reliability Engineer',
  'Data Engineer', 'Machine Learning Engineer', 'Platform Engineer',
  'Senior Frontend Engineer', 'DevOps Engineer', 'Solutions Architect',
  'Technical Lead', 'Backend Developer', 'Cloud Infrastructure Engineer',
  'Senior Data Scientist', 'Mobile Engineer (Android)', 'Security Engineer',
  'Database Administrator', 'QA Automation Engineer',
] as const

const COMPANIES = [
  'Flipkart', 'Swiggy', 'Razorpay', 'Zerodha', 'PhonePe', 'Meesho', 'CRED',
  'Postman', 'Freshworks', 'Zoho', 'InMobi', 'Myntra', 'Dunzo', 'Udaan',
  'BrowserStack', 'Chargebee', 'Hasura', 'Zomato', 'Ola', 'Unacademy',
  'ThoughtWorks', 'Infosys', 'Wipro', 'Mphasis', 'Tekion', 'Rippling',
  'Atlassian', 'Databricks', 'Stripe', 'Twilio',
] as const

const LOCATIONS = [
  'Koramangala, Bengaluru', 'Indiranagar, Bengaluru', 'Whitefield, Bengaluru',
  'HSR Layout, Bengaluru', 'Electronic City, Bengaluru', 'Marathahalli, Bengaluru',
  'Jayanagar, Bengaluru', 'Bellandur, Bengaluru', 'JP Nagar, Bengaluru',
  'Hebbal, Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Gurugram', 'Mumbai',
  'Noida', 'Remote (India)', 'Singapore', 'Dubai', 'London',
] as const

const PROVIDERS: readonly Provider[] = ['pdl', 'apollo', 'proxycurl', 'coresignal'] as const

const CALL_STATUSES: readonly CallStatus[] = [
  'queued', 'dialing', 'connected', 'completed', 'failed', 'no_answer', 'blocked',
] as const

const FAILURE_REASONS = [
  'Rate limit exceeded',
  'Upstream timeout after 30s',
  'Invalid API credentials',
  'Provider returned 502',
] as const

export interface GenerateOptions {
  readonly count: number
  readonly seed?: number | undefined
  /** Fraction with no call yet — the pre-campaign search results case. */
  readonly uncalledRatio?: number | undefined
}

export function generateCandidates(options: GenerateOptions): Candidate[] {
  const { count, seed = 42, uncalledRatio = 0.6 } = options
  const rng = createRng(seed)

  return Array.from({ length: count }, (_unused, index): Candidate => {
    const first = rng.pick(FIRST_NAMES)
    const last = rng.pick(LAST_NAMES)

    // 1–3 providers agreed on this person; more sources reads as higher trust.
    const sourceCount = rng.int(1, 4)
    const sources = [...PROVIDERS].slice(0, sourceCount)

    const called = !rng.bool(uncalledRatio)
    const callStatus = called ? rng.pick(CALL_STATUSES) : null

    // +91 80 XXXX XXXX — Bengaluru landline-style prefix on a mobile shape.
    const phone = `+9180${String(rng.int(10_000_000, 99_999_999))}`

    return {
      id: `cand_${String(index).padStart(6, '0')}`,
      name: `${first} ${last}`,
      title: rng.pick(TITLES),
      company: rng.pick(COMPANIES),
      location: rng.pick(LOCATIONS),
      phone,
      // Some records genuinely have no email — the UI must render the gap.
      email: rng.bool(0.82)
        ? `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`
        : null,
      linkedinUrl: rng.bool(0.75)
        ? `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase().replace(/[^a-z]/g, '')}`
        : null,
      yearsExperience: rng.int(1, 22),
      matchScore: Math.round(rng.next() * 100) / 100,
      sources,
      callStatus,
      lastCallAt: called
        ? new Date(Date.now() - rng.int(0, 72 * 3_600_000)).toISOString()
        : null,
      suppressed: rng.bool(0.03),
    }
  })
}

/** One provider failing while the others succeed — the partial-state case. */
export function generateProviderOutcome(seed = 7): {
  succeeded: Provider[]
  failed: { provider: Provider; reason: string }[]
} {
  const rng = createRng(seed)
  const failedProvider = rng.pick(PROVIDERS)
  return {
    succeeded: PROVIDERS.filter((provider) => provider !== failedProvider),
    failed: [{ provider: failedProvider, reason: rng.pick(FAILURE_REASONS) }],
  }
}
