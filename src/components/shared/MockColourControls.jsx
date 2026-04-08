import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';

const SLIDERS = [
  { id: 'brightness', label: 'Brightness', min: -100, max: 100, step: 5 },
  { id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 5 },
  { id: 'saturation', label: 'Saturation', min: -100, max: 100, step: 5 },
];

export default function MockColourControls({ onAdjust, disabled }) {
  const [values, setValues] = useState({ brightness: 0, contrast: 0, saturation: 0 });
  const { logEvent } = useEventLogger();

  const handleChange = useCallback((property, value) => {
    const numVal = Number(value);
    setValues((prev) => ({ ...prev, [property]: numVal }));
    logEvent(EventTypes.COLOUR_ADJUST, Actors.HELPER, { property, value: numVal });
    if (onAdjust) onAdjust(property, numVal);
    announce(`${property} set to ${numVal}.`);
  }, [logEvent, onAdjust]);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Colour Adjustments</h4>
      {SLIDERS.map((slider) => (
        <div key={slider.id}>
          <label className="flex items-center justify-between text-sm text-gray-700 mb-1">
            <span>{slider.label}</span>
            <span className="text-xs text-gray-500">{values[slider.id]}</span>
          </label>
          <input
            type="range"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={values[slider.id]}
            onChange={(e) => handleChange(slider.id, e.target.value)}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            aria-label={`${slider.label}: ${values[slider.id]}`}
            style={{ minHeight: '44px' }}
          />
        </div>
      ))}
    </div>
  );
}
