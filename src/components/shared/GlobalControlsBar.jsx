import { useEffect, useRef } from 'react';

function formatTotalDuration(seconds) {
  const s = Math.round(seconds || 0);
  return `${s} second${s === 1 ? '' : 's'}`;
}

export default function GlobalControlsBar({
  sceneCount = 0,
  totalDuration = 0,
  focusToken = 0,
}) {
  const summaryRef = useRef(null);
  const lastFocusedTokenRef = useRef(0);

  useEffect(() => {
    if (!focusToken || sceneCount === 0 || lastFocusedTokenRef.current === focusToken) {
      return undefined;
    }
    lastFocusedTokenRef.current = focusToken;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement !== summaryRef.current) {
        summaryRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusToken, sceneCount]);

  if (sceneCount === 0) return null;

  // Build the summary as a single template string so it renders as one
  // text node. Previously the JSX mixed `{expr}` interpolations with
  // literal "&middot;" entities, producing several adjacent text nodes;
  // TalkBack on Android announced each fragment separately ("1", "clip",
  // "5"...) instead of the whole sentence.
  const summary = `${sceneCount} scene${sceneCount === 1 ? '' : 's'} created, the total length is ${formatTotalDuration(totalDuration)}`;

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3">
      <p
        ref={summaryRef}
        className="text-xs text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 rounded"
        tabIndex={-1}
        data-project-summary-focus
      >
        {summary}
      </p>
    </div>
  );
}
