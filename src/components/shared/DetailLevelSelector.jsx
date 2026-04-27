import { useEffect, useRef } from 'react';
import { LEVELS, MIN_LEVEL, MAX_LEVEL } from '../../utils/detailLevels.js';
import { announce } from '../../utils/announcer.js';

/**
 * Detail-level stepper for scene descriptions.
 *
 * Stable two-button stepper: "Less detail" and "More detail" are *always*
 * enabled, with the same aria-label and identical styling regardless of
 * level. When tapped past the limit, step() refuses and fires an
 * assertive announce ("Already at the minimum/maximum detail level").
 * This avoids any per-click DOM mutation on the UNTAPPED button.
 *
 * Cross-platform announce strategy (2026-04-26 Lan, second iteration):
 *   1. The new description is delivered via an *assertive* announce
 *      from SceneBlockList.handleLevelChange — that's the only channel
 *      Android TalkBack reliably hears during the activated button's
 *      re-read.
 *   2. Focus also moves to the chip as a visual indicator. We tried
 *      relying on the chip's aria-label being read by AT on focus move
 *      — but on Android TalkBack a programmatic focus to a non-
 *      interactive `tabIndex={-1}` <span> doesn't reliably trigger a
 *      re-read, so the description disappeared (Lan-confirmed). The
 *      chip's accessible name is now intentionally short (just the
 *      visible level word) so iOS VoiceOver — which DOES re-read the
 *      newly focused element — doesn't duplicate the description that
 *      the assertive announce just delivered.
 *
 * Replaced the segmented "Overview / Detailed / Technical" radiogroup
 * (2026-04-26 Lan request). The imperative stepper labels tell the user
 * what each press does.
 */
export default function DetailLevelSelector({ currentLevel, onLevelChange, levelDescription }) {
  const current = LEVELS.find((l) => l.value === currentLevel) || LEVELS[0];
  const chipRef = useRef(null);
  // Track the previous level so we focus the chip *only* when the level
  // actually changes — not on initial mount and not on re-renders that
  // leave currentLevel alone. A simple `isInitialMount` ref doesn't work
  // here: React StrictMode in dev double-invokes effects, and the ref
  // persists across the re-mount, so a "first render" guard incorrectly
  // fires the second time.
  const prevLevelRef = useRef(currentLevel);

  useEffect(() => {
    if (prevLevelRef.current === currentLevel) return;
    prevLevelRef.current = currentLevel;
    // requestAnimationFrame so React has finished applying the new
    // aria-label before we focus the chip — focusing too early would let
    // TalkBack read the *stale* label.
    const raf = requestAnimationFrame(() => {
      chipRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [currentLevel]);

  const step = (delta) => {
    const next = currentLevel + delta;
    if (next < MIN_LEVEL) {
      // Assertive: limit-refusal must interrupt TalkBack's re-read of the
      // just-tapped Less/More button — otherwise the user hears nothing
      // and assumes the tap registered.
      announce('Already at the minimum detail level.', { assertive: true });
      return;
    }
    if (next > MAX_LEVEL) {
      announce('Already at the maximum detail level.', { assertive: true });
      return;
    }
    onLevelChange(next);
  };

  const buttonClass =
    'flex-1 py-2 text-sm font-medium rounded-lg transition-colors ' +
    'focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ' +
    'bg-gray-100 text-gray-700 hover:bg-gray-200';

  return (
    <div className="flex items-center gap-2" aria-label="Description detail level">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Less detail"
        className={buttonClass}
        style={{ minHeight: '44px' }}
      >
        Less detail
      </button>
      <span
        ref={chipRef}
        tabIndex={-1}
        className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white text-center focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '44px', minWidth: '92px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {current.label}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="More detail"
        className={buttonClass}
        style={{ minHeight: '44px' }}
      >
        More detail
      </button>
    </div>
  );
}
