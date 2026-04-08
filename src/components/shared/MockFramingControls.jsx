import { useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';

const RATIOS = [
  { id: 'original', label: 'Original' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
];

export default function MockFramingControls({ onSelect, currentRatio = 'original', disabled }) {
  const { logEvent } = useEventLogger();

  const handleSelect = useCallback((ratio) => {
    logEvent(EventTypes.FRAMING_CHANGE, Actors.HELPER, { ratio });
    if (onSelect) onSelect(ratio);
    announce(`Framing changed to ${ratio}.`);
  }, [logEvent, onSelect]);

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Framing / Crop</h4>
      <div className="flex gap-2">
        {RATIOS.map((ratio) => (
          <button
            key={ratio.id}
            onClick={() => handleSelect(ratio.id)}
            disabled={disabled}
            aria-pressed={currentRatio === ratio.id}
            className={`flex-1 py-2 text-sm rounded font-medium transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
              currentRatio === ratio.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{ minHeight: '44px' }}
          >
            {ratio.label}
          </button>
        ))}
      </div>
    </div>
  );
}
