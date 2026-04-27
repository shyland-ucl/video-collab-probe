// Helpers for TaskAudit-style interaction tracing.
//
// What this is: a thin layer over Playwright that records, around any
// user action, the four pieces of state a screen-reader user actually
// experiences:
//   1. document.activeElement (tag, role, accessible name)
//   2. anything written to either #sr-announcer (polite) or
//      #sr-announcer-assertive (alert) since the last sample
//   3. a small AT-tree fingerprint of the focused subtree
//   4. the visible focus indicator (whether the focused element is in
//      viewport)
//
// We snapshot before and after each user action, plus capture every
// live-region mutation that happens between via MutationObserver. The
// resulting trace is the evidence the analyzer (./judge.mjs) consumes.
//
// References:
//  - TaskAudit (Tan et al., 2025). https://arxiv.org/abs/2510.12972
//    "functiona11ity errors only manifest through interaction" —
//    static AT-tree dumps cannot catch them.
//  - ScreenAudit (Salehnamadi et al., 2025). https://arxiv.org/abs/2504.02110
//    semantic checks beyond rule-based axe-style findings.

/**
 * Install the live-region observer and a focus-change recorder on the
 * page. Call once after navigation; idempotent so repeated calls just
 * re-arm the observer on a fresh window object.
 */
export async function installRecorder(page) {
  await page.evaluate(() => {
    // Idempotent install — if we re-navigate, observers attached to a
    // dead document are gone, so we re-create them.
    if (window.__a11yTrace?.installed && document.contains(window.__a11yTrace.politeEl)) {
      window.__a11yTrace.events.length = 0;
      return;
    }
    const events = [];
    const polite = document.getElementById('sr-announcer');
    const assertive = document.getElementById('sr-announcer-assertive');
    if (polite) {
      new MutationObserver(() => {
        const text = polite.textContent || '';
        if (text) events.push({ kind: 'announce', region: 'polite', t: Date.now(), text });
      }).observe(polite, { childList: true, characterData: true, subtree: true });
    }
    if (assertive) {
      new MutationObserver(() => {
        const text = assertive.textContent || '';
        if (text) events.push({ kind: 'announce', region: 'assertive', t: Date.now(), text });
      }).observe(assertive, { childList: true, characterData: true, subtree: true });
    }
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el || el === document.body) return;
      events.push({
        kind: 'focus',
        t: Date.now(),
        tag: el.tagName,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaDisabled: el.getAttribute('aria-disabled'),
        text: (el.textContent || '').slice(0, 80).trim(),
      });
    }, true);
    window.__a11yTrace = { installed: true, events, politeEl: polite, assertiveEl: assertive };
  });
}

/** Pull all events recorded since the last drain, then clear the buffer. */
export async function drainEvents(page) {
  return page.evaluate(() => {
    const events = (window.__a11yTrace?.events || []).slice();
    if (window.__a11yTrace) window.__a11yTrace.events.length = 0;
    return events;
  });
}

/** Snapshot the currently focused element. */
export async function snapshotFocus(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaExpanded: el.getAttribute('aria-expanded'),
      ariaDisabled: el.getAttribute('aria-disabled'),
      text: (el.textContent || '').slice(0, 80).trim(),
      visible: (() => {
        const r = el.getBoundingClientRect?.();
        if (!r) return null;
        return r.bottom > 0 && r.top < (window.innerHeight || 0)
          && r.right > 0 && r.left < (window.innerWidth || 0);
      })(),
    };
  });
}

/**
 * Run a step in a journey: a description, an action function, and an
 * optional explicit expectation about what the SR user should hear.
 * Returns a {step, before, after, events} record.
 */
export async function runStep(page, step) {
  await drainEvents(page); // discard noise from before this step
  const before = await snapshotFocus(page);
  try {
    await step.action({ page });
  } catch (err) {
    return {
      step: step.name,
      expect: step.expect,
      threw: String(err?.message || err),
      before,
      after: null,
      events: [],
    };
  }
  // Allow live-region writes + focus changes to land before sampling.
  // 350ms covers the announcer's 30ms set + 150ms gap + RAF + paint
  // budget; longer than that is wasted runtime.
  await page.waitForTimeout(350);
  const after = await snapshotFocus(page);
  const events = await drainEvents(page);
  return { step: step.name, expect: step.expect, before, after, events };
}

/**
 * Run a sequence of steps and return the full trace.
 * @param {import('playwright').Page} page
 * @param {{name: string, action: (ctx: {page}) => Promise<void>, expect?: object}[]} steps
 */
export async function runJourney(page, steps) {
  await installRecorder(page);
  const trace = [];
  for (const step of steps) {
    const record = await runStep(page, step);
    trace.push(record);
  }
  return trace;
}
