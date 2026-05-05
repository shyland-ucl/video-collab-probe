import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';

// Day 1 fix #4: visual edit panel shared between helper and WoZ. Brightness/
// contrast/saturation map to a CSS filter; zoom/rotate map to a CSS transform.
// Both apply on top of the live <video> element via VideoPlayer's filter +
// transform props. Crop is intentionally absent (P2 work).
const SLIDERS = [
  { id: 'brightness', label: 'Brightness', min: -100, max: 100, step: 5, suffix: '' },
  { id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 5, suffix: '' },
  { id: 'saturation', label: 'Saturation', min: -100, max: 100, step: 5, suffix: '' },
  { id: 'zoom', label: 'Zoom', min: 100, max: 250, step: 10, suffix: '%' },
  { id: 'rotate', label: 'Rotate', min: -180, max: 180, step: 15, suffix: '°' },
];

const DEFAULT_VALUES = { brightness: 0, contrast: 0, saturation: 0, zoom: 100, rotate: 0 };

export default function MockColourControls({ values: controlledValues, onAdjust, disabled }) {
  // Controlled when `values` prop is provided (parent owns state and wires
  // the resulting CSS filter into VideoPlayer); otherwise falls back to
  // local-only state so existing call sites keep working.
  const [localValues, setLocalValues] = useState(DEFAULT_VALUES);
  const values = { ...DEFAULT_VALUES, ...(controlledValues || localValues) };
  const { logEvent } = useEventLogger();

  const handleChange = useCallback((property, value) => {
    const numVal = Number(value);
    if (!controlledValues) {
      setLocalValues((prev) => ({ ...prev, [property]: numVal }));
    }
    logEvent(EventTypes.COLOUR_ADJUST, Actors.HELPER, { property, value: numVal });
    if (onAdjust) onAdjust(property, numVal);
    announce(`${property} set to ${numVal}.`);
  }, [logEvent, onAdjust, controlledValues]);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Visual Adjustments</h4>
      {SLIDERS.map((slider) => (
        <div key={slider.id}>
          <label className="flex items-center justify-between text-sm text-gray-700 mb-1">
            <span>{slider.label}</span>
            <span className="text-xs text-gray-500">
              {values[slider.id]}{slider.suffix}
            </span>
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
            aria-label={`${slider.label}: ${values[slider.id]}${slider.suffix}`}
            style={{ minHeight: '44px' }}
          />
        </div>
      ))}
    </div>
  );
}
