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

export default function ConditionHeader({ condition, modeLabel }) {
  const config = conditionConfig[condition];
  if (!config) return null;

  return (
    <div
      className="w-full px-4 py-3 flex items-center gap-3"
      style={{ backgroundColor: config.color }}
      aria-hidden="true"
    >
      <span className="text-white font-bold text-lg">{config.label}</span>
      <span className="text-white/80 text-sm">{config.description}</span>
      {modeLabel && (
        <span className="ml-auto px-2 py-0.5 bg-white/20 text-white text-xs font-semibold rounded">
          {modeLabel}
        </span>
      )}
    </div>
  );
}
