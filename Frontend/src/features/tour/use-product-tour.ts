import { TourGuideClient } from '@sjmc11/tourguidejs'
import '@sjmc11/tourguidejs/dist/css/tour.min.css'
import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

const SEEN_KEY = 'hunar.tour.seen'

/**
 * Steps are grouped by the route they belong to. The tour walks the real
 * product rather than a slideshow, so it navigates between pages and picks
 * up where it left off — a single flat step list can't do that, because a
 * selector for the campaign page doesn't exist while /searches/new is
 * mounted.
 *
 * Every selector is a `data-tour` attribute on the real element (never a
 * class chain), so restyling a component can't silently break the tour.
 */
interface TourStep {
  readonly selector?: string
  readonly title: string
  readonly content: string
}

const STEPS: Readonly<Record<string, readonly TourStep[]>> = {
  '/campaigns': [
    {
      title: 'Welcome to the recruiter console',
      content:
        'This tour walks through the whole flow: paste a job description, find candidates, then let an AI voice agent screen them by phone. Use the arrow keys or the buttons to move through it.',
    },
    {
      selector: '[data-tour="nav-search"]',
      title: 'Start a new search',
      content:
        'Every campaign begins here — you paste a job description and the app extracts the role, skills and location from it.',
    },
    {
      selector: '[data-tour="campaign-list"]',
      title: 'Your campaigns',
      content:
        'Each row is a hiring campaign. The numbers are live: how many candidates are callable, how many were excluded for having no contact details, and how the calls went.',
    },
    {
      selector: '[data-tour="profile"]',
      title: 'Settings and your account',
      content:
        'Per-campaign calling settings, the do-not-call suppression list, and log out all live here.',
    },
  ],
  '/searches/new': [
    {
      selector: '[data-tour="jd-panel"]',
      title: 'Paste the job description',
      content:
        'Paste or upload a JD and the app reads it with an LLM, pulling out the title, must-have skills, experience and location. Every extracted field is an editable chip — correct anything it got wrong before searching.',
    },
    {
      selector: '[data-tour="provider-plan"]',
      title: 'Know the cost before you spend',
      content:
        'Once you confirm the filters, this panel prices the search against real provider rates and your actual remaining credits. Nothing is spent until you press Run search.',
    },
  ],
}

/** Steps shown on a search-results page (the path carries an id). */
const RESULTS_STEPS: readonly TourStep[] = [
  {
    selector: '[data-tour="results-toolbar"]',
    title: 'Pick who to call',
    content:
      'Candidates are ranked against the job description. Tick the ones worth calling — anyone without a phone or email is flagged, because the campaign will exclude them from calling.',
  },
  {
    selector: '[data-tour="candidate-detail"]',
    title: 'Why someone ranked here',
    content:
      'Clicking a row shows their contact details and exactly which job-description keywords matched their profile — the ranking explains itself rather than showing an opaque score.',
  },
]

/** Steps shown on a campaign dashboard (the path carries an id). */
const CAMPAIGN_STEPS: readonly TourStep[] = [
  {
    selector: '[data-tour="funnel"]',
    title: 'The funnel',
    content:
      'Sourced, called, connected, qualified — all counted from real call outcomes, updating live while calls are in progress.',
  },
  {
    selector: '[data-tour="call-button"]',
    title: 'Call in bulk',
    content:
      'Select candidates and place real phone calls. An AI agent pitches the role, asks whether they are interested, and — if they are — captures their notice period, expected pay and what else they would need.',
  },
  {
    selector: '[data-tour="call-detail"]',
    title: 'What happened on the call',
    content:
      'Click any candidate to hear the recording, read the transcript, and see every answer the agent extracted. Clicking a transcript line jumps the audio to that moment.',
  },
]

function stepsForPath(pathname: string): readonly TourStep[] {
  if (pathname.startsWith('/campaigns/')) return CAMPAIGN_STEPS
  if (pathname.startsWith('/searches/') && pathname !== '/searches/new') return RESULTS_STEPS
  return STEPS[pathname] ?? []
}

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true // Storage blocked — don't nag on every page load.
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Nothing to persist; the tour simply offers itself again next time.
  }
}

/**
 * Drives the TourGuide client for whichever route is mounted.
 *
 * The library talks to the DOM directly, so it is created once in a ref and
 * torn down on unmount — recreating it per render would leave orphaned
 * backdrops behind.
 */
export function useProductTour() {
  const tourRef = useRef<TourGuideClient | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      void tourRef.current?.exit()
      tourRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    const steps = stepsForPath(location.pathname)
    // Nothing anchored on this route — send the user somewhere the tour has
    // something to show rather than opening an empty dialog.
    if (steps.length === 0) {
      navigate('/campaigns')
      return
    }

    markSeen()
    const client =
      tourRef.current ??
      new TourGuideClient({
        exitOnClickOutside: false,
        showStepDots: true,
        rememberStep: false,
        closeButton: true,
        nextLabel: 'Next',
        prevLabel: 'Back',
        finishLabel: 'Done',
      })
    tourRef.current = client

    void client
      .setOptions({
        steps: steps.map((step) => ({
          ...(step.selector ? { target: step.selector } : {}),
          title: step.title,
          content: step.content,
        })),
      })
      .then(() => client.start())
  }, [location.pathname, navigate])

  return { start, hasSeen: hasSeenTour() }
}
