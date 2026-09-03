import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markAdIdentityAttached,
  resetAdIdentity,
  waitForAdIdentity,
} from "./adIdentity";

// The gate exists so a conversion can WAIT for the ad pixels' identity
// attachment instead of racing it (see the module header). The two properties
// that matter are opposites, and both are load-bearing: it must actually
// block until identity lands, and it must NEVER block forever — a conversion
// that fires unidentified is a match-quality problem, one that never fires is
// a revenue-reporting problem.

test("waits until identity is attached, then resolves immediately", async () => {
  resetAdIdentity();

  let resolved = false;
  const waiting = waitForAdIdentity(5000).then(() => {
    resolved = true;
  });

  // Nothing has attached identity yet, so the gate must still be closed.
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(resolved, false, "resolved before identity was attached");

  markAdIdentityAttached();
  await waiting;
  assert.equal(resolved, true);

  // Already attached — a later caller must not wait at all.
  const started = Date.now();
  await waitForAdIdentity(5000);
  assert.ok(
    Date.now() - started < 50,
    "an already-attached gate must resolve without waiting"
  );
});

test("safety valve: resolves on timeout when identity never attaches", async () => {
  resetAdIdentity();

  // The /api/user/me failure case. The conversion degrades to unidentified
  // rather than being held hostage to identity that is never coming.
  const started = Date.now();
  await waitForAdIdentity(40);
  const waited = Date.now() - started;

  assert.ok(waited >= 30, `expected to wait for the timeout, waited ${waited}ms`);
  assert.ok(waited < 1000, `expected the timeout to cap the wait, waited ${waited}ms`);
});

test("resetAdIdentity re-arms the gate for the next signed-in user", async () => {
  markAdIdentityAttached();
  await waitForAdIdentity(5000); // open

  // Sign-out drops the previous user's identifiers, so the gate must close
  // again — otherwise a conversion on a shared browser would sail through
  // reporting itself identified while carrying nobody's identity.
  resetAdIdentity();

  let resolved = false;
  void waitForAdIdentity(5000).then(() => {
    resolved = true;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(resolved, false, "gate stayed open after reset");

  markAdIdentityAttached();
});
