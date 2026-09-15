import { test } from "node:test";
import assert from "node:assert/strict";
import { googleTagSnippet } from "./googleTag";

// googleTagSnippet decides what the root layout injects on every page, so the
// cases worth locking down are the ones that fail silently in prod: an unset
// id must render nothing, one gtag.js load must configure both products, and
// a malformed id must never reach the inline script.

const ADS = "AW-18343394468";
const GA = "G-3S19LWRTT5";
const LOADER = "https://www.googletagmanager.com/gtag/js?id=";

// Run the inline snippet the way a browser would (sloppy-mode script, window
// is the global object) and return what it queued: the entries gtag.js
// replays once it loads. new Function also throws on a syntax error, so every
// case below doubles as a check that the rendered script parses.
function queued(init: string): unknown[] {
  const g = globalThis as { window?: unknown; dataLayer?: unknown[] };
  g.window = globalThis;
  delete g.dataLayer;
  try {
    new Function(init)();
    return g.dataLayer ?? [];
  } finally {
    delete g.window;
    delete g.dataLayer;
  }
}

function configs(init: string): unknown[][] {
  return queued(init)
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((args) => args[0] === "config");
}

test("no ids → renders nothing", () => {
  assert.equal(googleTagSnippet({}), null);
  assert.equal(googleTagSnippet({ adsId: "", analyticsId: "  " }), null);
});

test("Ads only → the Ads tag, with enhanced conversions, as before", () => {
  const snippet = googleTagSnippet({ adsId: ADS });
  assert.ok(snippet);
  assert.equal(snippet.src, `${LOADER}${ADS}`);
  assert.deepEqual(configs(snippet.init), [
    ["config", ADS, { allow_enhanced_conversions: true }],
  ]);
});

test("Analytics only → loads and configures GA4 by itself", () => {
  const snippet = googleTagSnippet({ analyticsId: GA });
  assert.ok(snippet);
  assert.equal(snippet.src, `${LOADER}${GA}`);
  assert.deepEqual(configs(snippet.init), [["config", GA]]);
});

test("both → one gtag.js load, a config for each product", () => {
  const snippet = googleTagSnippet({ adsId: ADS, analyticsId: GA });
  assert.ok(snippet);
  assert.equal(snippet.src, `${LOADER}${ADS}`);
  assert.deepEqual(configs(snippet.init), [
    ["config", ADS, { allow_enhanced_conversions: true }],
    ["config", GA],
  ]);
});

test("queues `arguments` objects, js first (gtag.js ignores plain arrays)", () => {
  const snippet = googleTagSnippet({ adsId: ADS, analyticsId: GA });
  assert.ok(snippet);
  const entries = queued(snippet.init);
  assert.equal(entries.length, 3);
  for (const entry of entries) {
    assert.equal(Object.prototype.toString.call(entry), "[object Arguments]");
  }
  const first = Array.from(entries[0] as ArrayLike<unknown>);
  assert.equal(first[0], "js");
  assert.ok(first[1] instanceof Date);
});

test("trims whitespace around a pasted id", () => {
  const snippet = googleTagSnippet({ analyticsId: ` ${GA}\n` });
  assert.ok(snippet);
  assert.deepEqual(configs(snippet.init), [["config", GA]]);
});

test("a malformed id is dropped with a warning and never breaks the other tag", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const pastedSnippet = `<script async src="${LOADER}${GA}"></script>`;

  for (const bad of [pastedSnippet, `'${GA}'`, `${GA}');alert(1);('`]) {
    const snippet = googleTagSnippet({ adsId: ADS, analyticsId: bad });
    assert.ok(snippet);
    assert.equal(snippet.src, `${LOADER}${ADS}`);
    assert.deepEqual(configs(snippet.init), [
      ["config", ADS, { allow_enhanced_conversions: true }],
    ]);
    assert.ok(!snippet.init.includes(bad));
  }
  assert.equal(warn.mock.callCount(), 3);
  assert.match(
    String(warn.mock.calls[0].arguments[0]),
    /NEXT_PUBLIC_GOOGLE_ANALYTICS_ID/
  );

  // With nothing valid left there is nothing to load.
  assert.equal(googleTagSnippet({ analyticsId: pastedSnippet }), null);
});
