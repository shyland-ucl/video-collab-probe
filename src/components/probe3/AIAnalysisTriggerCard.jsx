/**
 * Probe 3 — participant-invoked AI analysis trigger.
 *
 * Replaces the wizard's drip-feed of suggestions with a single
 * participant-driven moment: tap the button, hear the AI "analyse"
 * the video (animated card + voiceover), then all suggestions in the
 * pre-authored bank surface in their related scene blocks.
 *
 * One-shot per session. Both creator and helper can trigger; whichever
 * side taps first broadcasts to the other so they go through the
 * sequence together.
 */
const CATEGORY_BADGE = {
  issue: { label: 'Issue', bg: '#FEF2F2', text: '#991B1B' },
  structural: { label: 'Structural', bg: '#FFFBEB', text: '#92400E' },
  creative: { label: 'Creative', bg: '#EFF6FF', text: '#1E40AF' },
};

export default function AIAnalysisTriggerCard({
  analysisTriggered,
  analysisInProgress,
  onTrigger,
  suggestionCount = 0,
  triggeredBy = null, // 'creator' | 'helper' | null
  selfRole = null,    // current viewer's role for label personalisation
  // Helper-only: the curated list, rendered as a read-only summary so the
  // helper can see what the AI surfaced and anticipate the creator's
  // routing decisions. Null/empty hides the list. Creator already sees
  // these inline in their scene blocks, so we don't duplicate there.
  curatedSuggestions = null,
}) {
  // ── Pre-trigger ──
  if (!analysisTriggered && !analysisInProgress) {
    return (
      <div
        className="rounded-2xl p-4 mb-3 mx-3 border-2"
        style={{ borderColor: '#9B59B6', background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#9B59B6' }} />
          <h2 className="text-sm font-bold tracking-wider text-[#6b21a8] uppercase">AI Suggestions</h2>
        </div>
        <p className="text-sm text-gray-800 mb-3">
          Tap below to have the AI analyse this video and surface
          editing suggestions next to the relevant scenes. You and your
          partner will both see the analysis happen.
        </p>
        <button
          type="button"
          onClick={onTrigger}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 hover:brightness-110"
          style={{ backgroundColor: '#6B21A8', minHeight: '48px' }}
          aria-label="Trigger AI analysis of this video"
        >
          <span aria-hidden="true">✨ </span>Analyse with AI
        </button>
      </div>
    );
  }

  // ── In-progress (animated) ──
  if (analysisInProgress) {
    const triggerLabel = triggeredBy === selfRole
      ? 'You started AI analysis'
      : triggeredBy
        ? `${triggeredBy.charAt(0).toUpperCase() + triggeredBy.slice(1)} started AI analysis`
        : 'AI analysis in progress';
    return (
      <div
        className="rounded-2xl p-4 mb-3 mx-3 border-2"
        style={{ borderColor: '#9B59B6', background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)' }}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            aria-hidden="true"
            className="inline-block w-3 h-3 rounded-full animate-pulse"
            style={{ backgroundColor: '#9B59B6', boxShadow: '0 0 8px rgba(155,89,182,0.5)' }}
          />
          <h2 className="text-sm font-bold tracking-wider text-[#6b21a8] uppercase">AI Suggestions</h2>
        </div>
        <p className="text-sm font-medium text-gray-900">{triggerLabel}.</p>
        <p className="text-sm text-gray-700 mt-1">
          The AI is analysing your video. This may take a moment.
        </p>
        <div className="mt-3 flex items-center gap-2" aria-hidden="true">
          <div className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  // ── Post-trigger ──
  // Helper sees the full curated list inline — they don't have scene
  // blocks to attach suggestions to, but they need to know what the AI
  // surfaced so they can anticipate what the creator might route to them.
  // Creator gets a compact badge because the suggestions live inline in
  // their scene blocks (visible there).
  const showHelperList = selfRole === 'helper'
    && Array.isArray(curatedSuggestions)
    && curatedSuggestions.length > 0;

  return (
    <div
      className="rounded-2xl p-3 mb-3 mx-3 border"
      style={{ borderColor: '#d8b4fe', background: '#faf5ff' }}
      role="status"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">✨</span>
        <p className="text-sm text-gray-800">
          <span className="font-medium">AI analysis complete.</span>{' '}
          {suggestionCount > 0
            ? `${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'} ${selfRole === 'helper' ? 'available — creator decides what to do with each' : 'now showing in your scenes'}.`
            : 'No suggestions surfaced for this video.'}
        </p>
      </div>

      {showHelperList && (
        <ul className="mt-3 space-y-2" aria-label="AI suggestions visible to the creator">
          {curatedSuggestions.map((s) => {
            const badge = CATEGORY_BADGE[s.category] || { label: s.category, bg: '#f3f4f6', text: '#374151' };
            const sceneLabel = typeof s.relatedScene === 'number'
              ? `Scene ${s.relatedScene + 1}`
              : Array.isArray(s.relatedScene) && s.relatedScene.length > 0
                ? `Scene ${s.relatedScene[0] + 1}`
                : null;
            return (
              <li
                key={s.id}
                className="text-sm bg-white border border-purple-100 rounded-lg p-2"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: badge.bg, color: badge.text }}
                  >
                    {badge.label}
                  </span>
                  {sceneLabel && (
                    <span className="text-xs text-gray-500">{sceneLabel}</span>
                  )}
                </div>
                <p className="text-sm text-gray-800 leading-snug">{s.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
