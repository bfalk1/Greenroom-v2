import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_ADS_PURCHASE_LABEL,
  googleAdsClearUserData,
  googleAdsPurchase,
  googleAdsPurchaseSendTo,
  googleAdsSetUserData,
} from "./googleAds";
import { trackCheckoutCompleteOutcome } from "./analytics";

// googleAds.ts is a browser module; these tests run it against a minimal
// window stand-in. That is deliberate — the two things worth locking down
// are wire-format details gtag.js enforces silently: entries must be
// `arguments` objects (a plain array push is GTM syntax and is ignored),
// and repeat fires must be suppressed per transaction.

type AnyWindow = {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  localStorage: {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
  };
};

function installWindow(opts?: { brokenStorage?: boolean }): AnyWindow {
  const store = new Map<string, string>();
  const win: AnyWindow = {
    localStorage: opts?.brokenStorage
      ? {
          getItem: () => {
            throw new Error("storage blocked");
          },
          setItem: () => {
            throw new Error("storage blocked");
          },
        }
      : {
          getItem: (k) => store.get(k) ?? null,
          setItem: (k, v) => {
            store.set(k, v);
          },
        },
  };
  (globalThis as { window?: unknown }).window = win;
  return win;
}

beforeEach(() => {
  delete (globalThis as { window?: unknown }).window;
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-18343394468";
});

test("send_to routes to the env tag id + the Purchase label", () => {
  assert.equal(
    googleAdsPurchaseSendTo(),
    `AW-18343394468/${GOOGLE_ADS_PURCHASE_LABEL}`
  );
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "";
  assert.equal(googleAdsPurchaseSendTo(), undefined);
});

test("no env id → inert: nothing installed, nothing pushed", () => {
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "";
  const win = installWindow();
  googleAdsPurchase({ transactionId: "cs_test_1", valueUsdCents: 1799 });
  assert.equal(win.dataLayer, undefined);
  assert.equal(win.gtag, undefined);
});

test("pushes an arguments object (not an array) with Google's param names", () => {
  const win = installWindow();
  googleAdsPurchase({ transactionId: "cs_test_1", valueUsdCents: 1799 });

  assert.equal(win.dataLayer!.length, 1);
  const entry = win.dataLayer![0] as ArrayLike<unknown>;
  // gtag.js discriminates real gtag() calls from GTM-style array pushes by
  // the entry being an `arguments` object — an array here would be silently
  // dropped, which is exactly the bug this test exists to catch.
  assert.ok(!Array.isArray(entry), "entry must be an arguments object");
  assert.equal(entry.length, 3);
  assert.equal(entry[0], "event");
  assert.equal(entry[1], "conversion");
  assert.deepEqual(entry[2], {
    send_to: `AW-18343394468/${GOOGLE_ADS_PURCHASE_LABEL}`,
    value: 17.99,
    currency: "USD",
    transaction_id: "cs_test_1",
  });
});

test("once per transaction: refresh replays are suppressed, new transactions fire", () => {
  const win = installWindow();
  googleAdsPurchase({ transactionId: "cs_test_1", valueUsdCents: 1799 });
  googleAdsPurchase({ transactionId: "cs_test_1", valueUsdCents: 1799 });
  assert.equal(win.dataLayer!.length, 1);

  // A later re-subscription (or second buyer on a shared browser) carries a
  // fresh provider token and must not be suppressed by the first one.
  googleAdsPurchase({ transactionId: "I-PAYPAL2", valueUsdCents: 599 });
  assert.equal(win.dataLayer!.length, 2);
  const entry = win.dataLayer![1] as ArrayLike<unknown>;
  assert.deepEqual(entry[2], {
    send_to: `AW-18343394468/${GOOGLE_ADS_PURCHASE_LABEL}`,
    value: 5.99,
    currency: "USD",
    transaction_id: "I-PAYPAL2",
  });
});

test("blocked localStorage fires anyway — transaction_id still dedupes server-side", () => {
  const win = installWindow({ brokenStorage: true });
  googleAdsPurchase({ transactionId: "cs_test_1", valueUsdCents: 1799 });
  googleAdsPurchase({ transactionId: "cs_test_1", valueUsdCents: 1799 });
  // Without storage there is no local guard; both fire and Google's own
  // transaction_id dedup absorbs the repeat.
  assert.equal(win.dataLayer!.length, 2);
});

// The seam the browser can't verify locally (/checkout/complete is
// auth-gated and local dev has no DB): the real trackCheckoutCompleteOutcome
// must reach googleAdsPurchase on a verified activation, and must not on a
// timeout. Meta/TikTok/PostHog are all inert here (no env ids, uninitialized
// posthog no-ops), so the dataLayer is this test's only observable output.
test("trackCheckoutCompleteOutcome fires the Google conversion only when confirmed", () => {
  const win = installWindow();
  trackCheckoutCompleteOutcome({
    provider: "stripe",
    initialStatus: null,
    outcome: "timeout",
  });
  assert.equal(win.dataLayer, undefined);

  trackCheckoutCompleteOutcome({
    provider: "stripe",
    initialStatus: null,
    outcome: "confirmed",
    secondsToConfirm: 3,
    tier: "VIP",
    valueUsdCents: 1799,
    transactionId: "cs_test_seam",
  });
  assert.equal(win.dataLayer!.length, 1);
  const entry = win.dataLayer![0] as ArrayLike<unknown>;
  assert.equal(entry[1], "conversion");
  assert.deepEqual(entry[2], {
    send_to: `AW-18343394468/${GOOGLE_ADS_PURCHASE_LABEL}`,
    value: 17.99,
    currency: "USD",
    transaction_id: "cs_test_seam",
  });
});

// Enhanced Conversions user_data. gtag.js hashes email/first/last itself on
// transmission, so what we stage here is RAW values in Google's documented
// field names — the assertions below are the wire contract with gtag.js.
test("googleAdsSetUserData stages email + split name + uppercase ISO2 country", () => {
  const win = installWindow();
  googleAdsSetUserData({
    email: "  Buyer@Example.com ",
    fullName: "Mary Jane Watson",
    city: "Austin",
    state: null,
    postalCode: "78701",
    country: "United States", // stored display name, not a code
  });
  assert.equal(win.dataLayer!.length, 1);
  const entry = win.dataLayer![0] as ArrayLike<unknown>;
  assert.equal(entry[0], "set");
  assert.equal(entry[1], "user_data");
  assert.deepEqual(entry[2], {
    email: "Buyer@Example.com",
    address: {
      first_name: "Mary Jane", // same split rule as Meta: last token = surname
      last_name: "Watson",
      city: "Austin",
      postal_code: "78701",
      country: "US", // Google wants uppercase alpha-2; Meta's is lowercase
    },
  });
});

test("googleAdsSetUserData with a sparse profile stages only what exists", () => {
  const win = installWindow();
  // The pre-signup-fix cohort: email is the only identifier on file.
  googleAdsSetUserData({ email: "old@user.com", fullName: null, country: "" });
  const entry = win.dataLayer![0] as ArrayLike<unknown>;
  assert.deepEqual(entry[2], { email: "old@user.com" });

  // Nothing usable → nothing staged (and an unresolvable country is omitted
  // rather than sent as a value that can never match).
  googleAdsSetUserData({ email: "  ", fullName: null, country: "Atlantis" });
  assert.equal(win.dataLayer!.length, 1);
});

test("googleAdsClearUserData replaces staged identifiers with an empty object", () => {
  const win = installWindow();
  googleAdsSetUserData({ email: "buyer@example.com" });
  googleAdsClearUserData();
  assert.equal(win.dataLayer!.length, 2);
  const entry = win.dataLayer![1] as ArrayLike<unknown>;
  assert.equal(entry[0], "set");
  assert.equal(entry[1], "user_data");
  assert.deepEqual(entry[2], {});
});

test("user_data staging is inert without the env id", () => {
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "";
  const win = installWindow();
  googleAdsSetUserData({ email: "buyer@example.com" });
  googleAdsClearUserData();
  assert.equal(win.dataLayer, undefined);
});

test("reuses an existing window.gtag instead of installing a second stub", () => {
  const win = installWindow();
  const seen: unknown[][] = [];
  win.gtag = (...args: unknown[]) => {
    seen.push(args);
  };
  googleAdsPurchase({ transactionId: "cs_test_9", valueUsdCents: 1099 });
  assert.equal(seen.length, 1);
  assert.equal(win.dataLayer, undefined);
  assert.equal(seen[0][0], "event");
  assert.equal(seen[0][1], "conversion");
});
