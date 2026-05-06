import { useState, useCallback, useRef, useEffect } from 'react';
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

export default function MockColourControls({
  values: controlledValues,
  onAdjust,
  disabled,
  actor = Actors.HELPER,
  variant = 'light',
}) {
  // Controlled when `values` prop is provided (parent owns state and wires
  // the resulting CSS filter into VideoPlayer); otherwise falls back to
  // local-only state so existing call sites keep working.
  const [localValues, setLocalValues] = useState(DEFAULT_VALUES);
  const values = { ...DEFAULT_VALUES, ...(controlledValues || localValues) };
  const { logEvent } = useEventLogger();
  const announceTimersRef = useRef({});

  useEffect(() => () => {
    Object.values(announceTimersRef.current).forEach(clearTimeout);
    announceTimersRef.current = {};
  }, []);

  const handleChange = useCallback((property, value) => {
    const numVal = Number(value);
    if (!controlledValues) {
      setLocalValues((prev) => ({ ...prev, [property]: numVal }));
    }
    logEvent(EventTypes.COLOUR_ADJUST, actor, { property, value: numVal });
    if (onAdjust) onAdjust(property, numVal);
    // Debounce the live-region announcement so dragging a slider only reads
    // the final value once, not every tick.
    if (announceTimersRef.current[property]) {
      clearTimeout(announceTimersRef.current[property]);
    }
    announceTimersRef.current[property] = setTimeout(() => {
      announce(`${property} set to ${numVal}.`);
      delete announceTimersRef.current[property];
    }, 500);
  }, [logEvent, onAdjust, controlledValues, actor]);

  const isDark = variant === 'dark';

  return (
    <div className="space-y-3">
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
        Visual Adjustments
      </h4>
      {SLIDERS.map((slider) => (
        <div key={slider.id}>
          <label className={`flex items-center justify-between text-sm mb-1 ${isDark ? 'text-white/85' : 'text-gray-700'}`}>
            <span>{slider.label}</span>
            <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
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
            className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 ${
              isDark ? 'bg-white/20' : 'bg-gray-200'
            }`}
            aria-label={`${slider.label}: ${values[slider.id]}${slider.suffix}`}
            style={{ minHeight: '44px' }}
          />
        </div>
      ))}
    </div>
  );
}
