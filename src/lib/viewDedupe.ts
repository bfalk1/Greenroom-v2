// Module-scope de-duplication for "view" events — the ones a component fires
// from a mount effect rather than from a user action.
//
// Why this cannot live in a component: a useRef guard only protects re-entry
// within ONE mount. Two things defeat it. (1) A remount: AppShell used to swap
// between structurally different web and desktop trees after mount, tearing
// down and rebuilding every page under (main), so a client-side nav mounted the
// page twice with fresh refs (measured: 2 instances per nav in an Electron user
// agent, 1 in a normal browser). That is fixed at the source now, but the class
// of bug is one line of JSX away from returning. (2) An effect whose deps change
// during a single mount — /pricing calls history.replaceState() to strip
// ?canceled=true, Next re-syncs useSearchParams from it, and any effect keyed on
// searchParams runs a second time.
//
// Module scope survives both: the module is evaluated once per page load and
// keeps its Map across every remount and re-render underneath it.
//
// Two windows, because the two problems have different shapes. A remount
// re-fires ~10ms later, so a few seconds covers it with room to spare, and
// keeping it short preserves real signal — a buyer who bounces back and retries
// checkout IS a second intent. A plan grid needs the longer one: its billing
// toggle sits directly above the cards and re-runs the view effect on every
// click, so a short window would let one visitor flip month/year/month/year and
// mint a valued ViewContent each time. At ten minutes a visit reports each
// product at most once, while a genuine return later in a long session still
// counts. Under-counting is the safer failure mode: an inflated `value` trains
// value-based bidding on revenue nobody viewed, a missed view costs a little
// signal.
export const REMOUNT_DEDUPE_MS = 5_000;
export const PRODUCT_VIEW_DEDUPE_MS = 600_000;

const lastViewAt = new Map<string, number>();

// Returns true if `key` was already reported inside `windowMs` — i.e. the
// caller should skip. The window does NOT slide: a suppressed call does not
// push the deadline out, so a steady stream of duplicates still reports once
// per window rather than never.
export function viewAlreadySent(
  key: string,
  windowMs: number,
  now: number = Date.now()
): boolean {
  const previous = lastViewAt.get(key);
  if (previous !== undefined && now - previous < windowMs) return true;
  lastViewAt.set(key, now);
  return false;
}

// Tests only — module state is per page load in the browser and never reset.
export function resetViewDedupe() {
  lastViewAt.clear();
}
