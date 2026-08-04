// Desktop notification polling.
//
// The desktop shell blocks /creator routes, so creators browse and play in the
// app but upload on the website. This module polls the site's notification API
// with the shell's session cookies and surfaces unread notifications (admin
// broadcasts like "time to upload", moderation decisions, application results)
// as native OS toasts. Clicking a toast opens the matching page on the website
// in the default browser. The dock badge mirrors total unread
// (notifications + message threads).
//
// All Electron/session specifics are injected by main.js, which keeps this
// file runnable (and testable) under plain Node.

const POLL_DELAYS_MS = {
  normal: 2 * 60 * 1000,
  // 401 — nobody is logged in; check less often until a session shows up.
  unauthed: 5 * 60 * 1000,
  // 404 — the notifications API isn't deployed on the server yet (it ships
  // with the notifications/messaging branch). Poll slowly, never error.
  unavailable: 15 * 60 * 1000,
};
const INITIAL_POLL_DELAY_MS = 10 * 1000;
const RETRY_POLL_DELAY_MS = 2 * 1000;
const MAX_TOASTS_PER_CYCLE = 3;
const REMEMBERED_IDS_LIMIT = 50;
const TITLE_PREVIEW_LIMIT = 80;
const BODY_PREVIEW_LIMIT = 140;

function truncate(text, limit) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) {
    return clean;
  }
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

// Where a toast click should land on the WEBSITE (external browser — the
// desktop shell can't render /creator routes). Upload nudges go straight to
// the upload page; everything else creator-facing lands on the dashboard,
// which links to every creator surface.
function pickWebsitePath(row) {
  switch (row?.type) {
    case "BROADCAST": {
      const text = [
        row.title,
        row.body,
        row.broadcast?.subject,
        row.broadcast?.body,
      ]
        .filter(Boolean)
        .join(" ");
      return /upload/i.test(text) ? "/creator/upload" : "/creator/dashboard";
    }
    case "SAMPLE_APPROVED":
    case "SAMPLE_REJECTED":
    case "SAMPLE_REMOVED":
    case "PRESET_APPROVED":
    case "PRESET_REJECTED":
    case "PRESET_REMOVED":
    case "APPLICATION_APPROVED":
      return "/creator/dashboard";
    case "APPLICATION_DENIED":
    default:
      // Denied applicants (and anything unknown) aren't creators — send them
      // to the site root rather than a page that would bounce them.
      return "/";
  }
}

function formatToast(row) {
  const title =
    truncate(row?.broadcast?.subject || row?.title, TITLE_PREVIEW_LIMIT) ||
    "GREENROOM";
  const body = truncate(row?.body || row?.broadcast?.body, BODY_PREVIEW_LIMIT);
  return { title, body };
}

// deps: {
//   fetchJson(pathname) -> Promise<{status, json}>   (never rejects)
//   showToast({title, body, onClick})
//   openWebsite(path)
//   setBadge(count)
//   getState() / setState(state)                     (persisted across runs)
//   log(message, details)
// }
function createNotificationPoller(deps) {
  const { fetchJson, showToast, openWebsite, setBadge, getState, setState, log } = deps;

  let timer = null;
  let stopped = true;
  let polling = false;

  async function runCycle() {
    const counts = await fetchJson("/api/notifications/unread-count");

    if (counts.status === 401) {
      // Logged out — clear any stale badge and back off.
      setBadge(0);
      return "unauthed";
    }
    if (counts.status === 404 || counts.status === 410) {
      return "unavailable";
    }
    if (
      counts.status !== 200 ||
      !counts.json ||
      typeof counts.json.total !== "number"
    ) {
      return "normal";
    }

    const totals = counts.json;
    setBadge(totals.total);

    const current = getState() || {};
    const firstCycle = !current.initialized;
    const next = {
      ...current,
      initialized: true,
      threadCount: totals.threads ?? 0,
      notifiedIds: Array.isArray(current.notifiedIds) ? current.notifiedIds : [],
    };

    let rows = [];
    if ((totals.notifications ?? 0) > 0) {
      const list = await fetchJson("/api/notifications?filter=unread&limit=10");
      if (list.status === 200 && Array.isArray(list.json?.notifications)) {
        rows = list.json.notifications; // newest first
      }
    }

    const newestCreatedAt = rows[0]?.createdAt || null;

    if (firstCycle) {
      // Seed the cursor so a fresh install doesn't blast the whole backlog —
      // only notifications created from now on produce toasts.
      next.cursor = newestCreatedAt || new Date().toISOString();
      setState(next);
      log("seeded notification cursor", {
        cursor: next.cursor,
        unread: totals.notifications ?? 0,
      });
      return "normal";
    }

    const fresh = rows
      .filter((row) => row && row.id && row.createdAt)
      .filter((row) => !next.cursor || row.createdAt > next.cursor)
      .filter((row) => !next.notifiedIds.includes(row.id))
      .reverse(); // oldest first so toasts arrive in order

    const toToast = fresh.slice(0, MAX_TOASTS_PER_CYCLE);

    for (const row of toToast) {
      const { title, body } = formatToast(row);
      const websitePath = pickWebsitePath(row);
      showToast({ title, body, onClick: () => openWebsite(websitePath) });
    }

    if (fresh.length > toToast.length) {
      showToast({
        title: "GREENROOM",
        body: `${fresh.length} new notifications — open the website to catch up.`,
        onClick: () => openWebsite("/creator/dashboard"),
      });
    }

    if (fresh.length > 0) {
      next.notifiedIds = [...next.notifiedIds, ...fresh.map((row) => row.id)].slice(
        -REMEMBERED_IDS_LIMIT
      );
      log("surfaced notifications", { count: fresh.length });
    }
    if (newestCreatedAt && (!next.cursor || newestCreatedAt > next.cursor)) {
      next.cursor = newestCreatedAt;
    }

    // Two-way messages: the cheap counts endpoint is enough to announce that
    // something new arrived without fetching thread contents.
    const previousThreads = current.threadCount ?? 0;
    if ((totals.threads ?? 0) > previousThreads) {
      showToast({
        title: "New message from the GREENROOM team",
        body: "Open greenroom.fm to read and reply.",
        onClick: () => openWebsite("/messages"),
      });
    }

    setState(next);
    return "normal";
  }

  async function pollOnce() {
    if (polling) {
      return "normal";
    }
    polling = true;
    try {
      return await runCycle();
    } catch (err) {
      log("poll cycle failed", { error: err instanceof Error ? err.message : String(err) });
      return "normal";
    } finally {
      polling = false;
    }
  }

  function schedule(delayMs) {
    if (stopped) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const outcome = await pollOnce();
      schedule(POLL_DELAYS_MS[outcome] ?? POLL_DELAYS_MS.normal);
    }, delayMs);
  }

  function start() {
    if (!stopped) {
      return;
    }
    stopped = false;
    schedule(INITIAL_POLL_DELAY_MS);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    timer = null;
  }

  // Pull the next poll forward (login navigation, laptop resume) without
  // stacking extra timers on top of the steady cadence.
  function pollSoon() {
    if (stopped) {
      return;
    }
    schedule(RETRY_POLL_DELAY_MS);
  }

  return { start, stop, pollOnce, pollSoon };
}

module.exports = {
  createNotificationPoller,
  pickWebsitePath,
  formatToast,
  truncate,
  POLL_DELAYS_MS,
  MAX_TOASTS_PER_CYCLE,
  REMEMBERED_IDS_LIMIT,
};
