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

/**
 * Drops steps whose target isn't on screen yet.
 *
 * Some panels exist in the DOM but are collapsed until earlier work is done
 * — the provider plan is `w-0 opacity-0` until a job description is parsed.
 * Highlighting one frames empty space at the screen edge, so those steps are
 * skipped rather than shown pointing at nothing.
 *
 * Ancestry is what's tested, not the target's own box: a collapsed parent
 * can contain a child that still measures its own padding (the provider
 * plan's inner div reports 48x48 inside a `w-0` parent), so a size check on
 * the target alone lets the step through. Panels that hide this way already
 * mark themselves `inert`/`aria-hidden` for accessibility, which is the
 * honest signal that there is nothing to look at.
 */
function visibleSteps(steps: readonly TourStep[]): readonly TourStep[] {
  return steps.filter((step) => {
    if (!step.selector) return true // Unanchored intro steps always show.
    const element = document.querySelector(step.selector)
    if (!element) return false
    if (element.closest('[aria-hidden="true"], [inert]')) return false
    // offsetParent is null for anything display:none (or a fixed-position
    // element, which none of these targets are).
    if (!(element instanceof HTMLElement) || element.offsetParent === null) return false
    const { width, height } = element.getBoundingClientRect()
    return width > 1 && height > 1
  })
}

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
    const steps = visibleSteps(stepsForPath(location.pathname))
    // Nothing anchored on this route — send the user somewhere the tour has
    // something to show rather than opening an empty dialog.
    if (steps.length === 0) {
      navigate('/campaigns')
      return
    }

    markSeen()

    // A fresh client per run, with the steps passed to the CONSTRUCTOR.
    //
    // Two library behaviours force this. setOptions() only does
    // Object.assign on options — it never calls computeTourSteps, so steps
    // handed to it are stored but never become this.tourSteps, and the tour
    // opens as a centred dialog highlighting nothing. addSteps() does
    // compute them, but appends, so reusing one client across routes would
    // stack every route's steps together.
    void tourRef.current?.exit()

    const client = new TourGuideClient({
      steps: steps.map((step) => ({
        ...(step.selector ? { target: step.selector } : {}),
        title: step.title,
        content: step.content,
      })),
      exitOnClickOutside: false,
      showStepDots: true,
      showStepProgress: true,
      rememberStep: false,
      closeButton: true,
      keyboardControls: true,
      nextLabel: 'Next',
      prevLabel: 'Back',
      finishLabel: 'Done',
    })
    tourRef.current = client

    void client.start()
  }, [location.pathname, navigate])

  /**
   * Opens the tour once, on a user's first visit.
   *
   * Waits for the step's target to exist before starting: the campaign list
   * renders only after its fetch resolves, and starting earlier would
   * highlight nothing. Gives up after ~3s rather than waiting forever on a
   * slow or failed request.
   */
  useEffect(() => {
    if (hasSeenTour()) return
    const steps = stepsForPath(location.pathname)
    const anchor = steps.find((step) => step.selector)?.selector
    if (steps.length === 0) return

    let cancelled = false
    let elapsed = 0
    const tick = window.setInterval(() => {
      elapsed += 150
      const ready = !anchor || document.querySelector(anchor) !== null
      if (cancelled) return
      if (ready || elapsed >= 3000) {
        window.clearInterval(tick)
        if (!cancelled) start()
      }
    }, 150)

    return () => {
      cancelled = true
      window.clearInterval(tick)
    }
  }, [location.pathname, start])

  return { start, hasSeen: hasSeenTour() }
}
