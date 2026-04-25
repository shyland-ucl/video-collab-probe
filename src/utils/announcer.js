/**
 * Screen-reader live announcer.
 *
 * Messages are queued and drained one at a time with a small gap between
 * each, which gives the screen reader enough of a DOM-mutation signal to
 * pick up each announcement separately. The previous setTimeout-clear-
 * then-set pattern dropped the first message whenever a second announce()
 * ran within ~100ms (M8 in walkthrough_findings_2026-04-25.md). Concrete
 * example of the dropped case: a user expands a scene block, which fires
 * `announce("Opened scene 1...")`; meanwhile the granularity selector
 * happens to fire `announce("Detail level changed to Detailed")` because
 * a parent-driven re-render commits in the same frame. With the old
 * implementation the user heard only the second; with the queue both
 * announcements are read.
 *
 * The element itself sets `role="status" aria-live="polite"
 * aria-atomic="true"` in App.jsx; this module only manages the text
 * content.
 */

const QUEUE_GAP_MS = 150;

const queue = [];
let draining = false;

function setText(text) {
  const el = typeof document !== 'undefined' ? document.getElementById('sr-announcer') : null;
  if (!el) return;
  // Clear first so the screen reader sees a real DOM change even when the
  // next message is identical to the current text.
  el.textContent = '';
  // Schedule the actual set on the next tick — this gives the live region
  // a moment to register the empty state before the new content arrives,
  // which is what makes assistive tech announce the content reliably.
  setTimeout(() => {
    el.textContent = text;
  }, 30);
}

function drain() {
  if (queue.length === 0) {
    draining = false;
    return;
  }
  draining = true;
  const next = queue.shift();
  setText(next);
  setTimeout(drain, QUEUE_GAP_MS);
}

/**
 * Announce a message to assistive technology.
 * @param {string} message
 */
export function announce(message) {
  if (typeof message !== 'string' || message.length === 0) return;
  queue.push(message);
  if (!draining) drain();
}

/**
 * Test-only: clear the pending queue without speaking.
 */
export function _resetAnnouncerForTests() {
  queue.length = 0;
  draining = false;
}
