import { useEffect, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';

const levels = [
  { value: 1, label: 'Overview' },
  { value: 2, label: 'Detailed' },
  { value: 3, label: 'Frame-by-Frame' },
];

export default function GranularityController({ level, onLevelChange }) {
  const { logEvent } = useEventLogger();

  const handleChange = useCallback((newLevel) => {
    if (newLevel === level) return;
    logEvent(EventTypes.DESCRIPTION_LEVEL_CHANGE, Actors.CREATOR, {
      from: level,
      to: newLevel,
    });
    const levelLabel = levels.find((l) => l.value === newLevel)?.label || newLevel;
    announce(`Description level changed to ${levelLabel}`);
    onLevelChange(newLevel);
  }, [level, onLevelChange, logEvent]);

  // Keyboard shortcuts: 1, 2, 3
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 3) {
        handleChange(num);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleChange]);

  return (
    <div
      role="radiogroup"
      aria-label="Description granularity level"
      className="flex gap-1"
    >
      {levels.map((l) => {
        const isActive = l.value === level;
        return (
          <button
            key={l.value}
            role="radio"
            aria-checked={isActive}
            aria-label={`${l.label} (press ${l.value})`}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 ${
              isActive
                ? 'text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            style={isActive ? { backgroundColor: '#2B579A' } : undefined}
            onClick={() => handleChange(l.value)}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
