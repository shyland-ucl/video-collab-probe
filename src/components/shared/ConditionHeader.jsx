const conditionConfig = {
  probe1: {
    color: '#2B579A',
    label: 'Probe 1: AI Description',
    description: 'AI-generated video descriptions at multiple levels of detail',
  },
  probe2: {
    color: '#5CB85C',
    label: 'Probe 2: Smart Handover',
    description: 'Collaborative editing with intent locking and handover suggestions',
  },
  probe3: {
    color: '#9B59B6',
    label: 'Probe 3: Local Mirroring',
    description: 'Synchronised multi-device viewing with independent exploration',
  },
};

export default function ConditionHeader({ condition, modeLabel }) {
  const config = conditionConfig[condition];
  if (!config) return null;

  return (
    <div
      className="w-full px-4 py-3 flex items-center gap-3"
      style={{ backgroundColor: config.color }}
      role="banner"
      aria-label={`Current condition: ${config.label}`}
    >
      <h1 className="text-white font-bold text-lg">{config.label}</h1>
      <span className="text-white/80 text-sm">{config.description}</span>
      {modeLabel && (
        <span className="ml-auto px-2 py-0.5 bg-white/20 text-white text-xs font-semibold rounded">
          {modeLabel}
        </span>
      )}
    </div>
  );
}
