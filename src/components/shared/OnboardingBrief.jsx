import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * OnboardingBrief — page-entry instructions surfaced as a modal popup.
 *
 * Day 1 fix (Lily, May 5): the inline brief was eating ~40% of the phone
 * viewport on entry, leaving almost no room for the scene list. Reworked
 * as a popup so the editing surface stays uncluttered:
 *   - On mount, opens a centred modal with the description text and a
 *     primary "Got it" button.
 *   - Once dismissed, the page chrome itself shows nothing — no inline
 *     panel, no banner. A tiny "ⓘ Show instructions" pill stays inline at
 *     the top of the page so the participant can re-open the modal at
 *     any time.
 *   - State is per-mount (no persistence) so each fresh probe entry
 *     re-reads the full brief for the next dyad.
 *
 * Accessibility:
 *   - role="dialog", aria-modal="true", aria-labelledby and -describedby.
 *   - Portal'd to <body> + `inert` on #root while open, so VoiceOver /
 *     TalkBack focus is trapped inside the modal (mirrors the existing
 *     VoiceOver-modal pattern noted in MEMORY.md).
 *   - Auto-focus the dismiss button on open so screen readers begin at
 *     the actionable element.
 *   - Escape key dismisses.
 */
export default function OnboardingBrief({ description, pageTitle }) {
  const [open, setOpen] = useState(true);
  const dismissBtnRef = useRef(null);
  // Track exactly what WE set on the body and #root so cleanup always
  // restores those values, even across StrictMode double-invocation,
  // hot reload, fast phase transitions, etc. Without this guard, a stale
  // `inert` left on #root makes the entire page unreachable to TalkBack
  // (the "stuck after region, video library" symptom).
  const setInertRef = useRef(false);
  const savedOverflowRef = useRef(null);

  const lockBackground = () => {
    const root = document.getElementById('root');
    if (root && !setInertRef.current) {
      root.setAttribute('inert', '');
      setInertRef.current = true;
    }
    if (savedOverflowRef.current === null) {
      savedOverflowRef.current = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
    }
  };

  const releaseBackground = () => {
    const root = document.getElementById('root');
    if (root && setInertRef.current) {
      root.removeAttribute('inert');
      setInertRef.current = false;
    }
    if (savedOverflowRef.current !== null) {
      document.body.style.overflow = savedOverflowRef.current;
      savedOverflowRef.current = null;
    }
  };

  // Lock background interaction + screen-reader focus while the modal is
  // open. `inert` on #root removes the page from the AT tree without
  // relying on a wide aria-hidden cascade.
  useEffect(() => {
    if (!open) {
      releaseBackground();
      return undefined;
    }
    lockBackground();
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // Focus the primary action so a screen-reader user lands on the
    // dismiss button and the description is read via aria-describedby.
    const raf = requestAnimationFrame(() => {
      dismissBtnRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      releaseBackground();
    };
  }, [open]);

  // Belt-and-braces unmount cleanup: even if a parent unmounts the brief
  // while the modal was still open (phase transition, route change,
  // hot reload), we strip our attributes. The ref guard makes this safe
  // to call multiple times.
  useEffect(() => () => releaseBackground(), []);

  if (!description) return null;

  return (
    <>
      {/* Inline re-open pill — only when the modal is dismissed. Sits in
          flow at the top of the page (under ConditionHeader) so the
          participant can always find it. Tiny footprint so it doesn't
          steal screen real estate from the scene list. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start mx-3 mt-2 mb-1 px-3 py-1.5 rounded-full text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          aria-label="Show page instructions"
        >
          <span aria-hidden="true">ⓘ</span> Show instructions
        </button>
      )}

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => {
            // Backdrop click dismisses; clicks inside the dialog do not
            // bubble to here (the dialog stops propagation below).
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-brief-title"
            aria-describedby="onboarding-brief-description"
            className="w-full sm:max-w-md mx-3 mb-3 sm:mb-0 bg-white rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <h2
                id="onboarding-brief-title"
                className="text-base font-bold text-gray-900"
              >
                {pageTitle || 'How this page works'}
              </h2>
              <p
                id="onboarding-brief-description"
                className="mt-2 text-base text-gray-700 leading-relaxed"
              >
                {description}
              </p>
            </div>
            <div className="px-5 pb-5">
              <button
                ref={dismissBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-3 rounded-lg text-white font-bold text-sm focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ backgroundColor: '#2B579A', minHeight: '48px' }}
                aria-label="Got it, close instructions"
              >
                Got it
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
