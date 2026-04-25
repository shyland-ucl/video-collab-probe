const conditionConfig = {
  probe1: {
    color: '#2B579A',
    label: 'Probe 1: AI Description',
    description: 'AI-generated video descriptions at multiple levels of detail',
  },
  probe2: {
    color: '#5CB85C',
    label: 'Probe 2a: Co-located Handover',
    description: 'Collaborative editing with intent locking and handover suggestions',
  },
  probe2b: {
    color: '#5CB85C',
    label: 'Probe 2b: Decoupled Coordination',
    description: 'Two-device collaboration with reactive task routing',
  },
  probe3: {
    color: '#9B59B6',
    label: 'Probe 3: Proactive AI',
    description: 'Decoupled collaboration with proactive AI suggestions',
  },
};

/**
 * Visible page-level header for each probe condition.
 *
 * Previously this whole block was `aria-hidden="true"` (decorative chrome
 * only) and the only real `<h1>` lived as `sr-only` inside OnboardingBrief.
 * That broke heading hierarchy for sighted helpers in a dyad: the visible
 * "Probe N: ..." text *looked* like a heading but wasn't one semantically.
 *
 * M4 fix: expose the title as a real `<h1>` so screen readers and sighted
 * users perceive the same heading. OnboardingBrief drops its `sr-only` h1
 * (now redundant). The description and mode-label remain in the same
 * element but become live content rather than aria-hidden.
 */
export default function ConditionHeader({ condition, modeLabel }) {
  const config = conditionConfig[condition];
  if (!config) return null;

  return (
    <div
      className="w-full px-4 py-3 flex items-center gap-3"
      style={{ backgroundColor: config.color }}
      role="banner"
    >
      <h1 className="text-white font-bold text-lg m-0">{config.label}</h1>
      <span className="text-white/80 text-sm">{config.description}</span>
      {modeLabel && (
        <span
          className="ml-auto px-2 py-0.5 bg-white/20 text-white text-xs font-semibold rounded"
          aria-label={`Mode: ${modeLabel}`}
        >
          {modeLabel}
        </span>
      )}
    </div>
  );
}
