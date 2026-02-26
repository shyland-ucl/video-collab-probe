import { useCallback } from 'react';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';

const textSizes = [
  { key: 'small', label: 'S' },
  { key: 'medium', label: 'M' },
  { key: 'large', label: 'L' },
];

export default function AccessibilityToolbar() {
  const { textSize, highContrast, audioEnabled, speechRate, setTextSize, toggleContrast, toggleAudio, setSpeechRate } = useAccessibility();
  const { logEvent } = useEventLogger();

  const handleTextSize = useCallback((size) => {
    setTextSize(size);
    logEvent(EventTypes.TEXT_SIZE_CHANGE, Actors.CREATOR, { size });
  }, [setTextSize, logEvent]);

  const handleContrast = useCallback(() => {
    toggleContrast();
    logEvent(EventTypes.CONTRAST_TOGGLE, Actors.CREATOR, { enabled: !highContrast });
  }, [toggleContrast, logEvent, highContrast]);

  const handleAudio = useCallback(() => {
    toggleAudio();
    logEvent(EventTypes.AUDIO_TOGGLE, Actors.CREATOR, { enabled: !audioEnabled });
  }, [toggleAudio, logEvent, audioEnabled]);

  const handleSpeechRate = useCallback((e) => {
    const rate = parseFloat(e.target.value);
    setSpeechRate(rate);
    logEvent(EventTypes.SPEECH_RATE_CHANGE, Actors.CREATOR, { rate });
  }, [setSpeechRate, logEvent]);

  const btnBase = 'px-3 py-1.5 text-sm font-medium rounded border transition-colors focus:outline-2 focus:outline-offset-2';

  return (
    <div className="flex items-center gap-3 flex-wrap" role="toolbar" aria-label="Accessibility options">
      {/* Text size buttons */}
      <div className="flex items-center gap-1">
        <span className="text-sm text-gray-600 mr-1">Text:</span>
        {textSizes.map((ts) => (
          <button
            key={ts.key}
            onClick={() => handleTextSize(ts.key)}
            className={btnBase}
            style={{
              borderColor: '#2B579A',
              backgroundColor: textSize === ts.key ? '#2B579A' : 'transparent',
              color: textSize === ts.key ? '#FFFFFF' : '#2B579A',
            }}
            aria-pressed={textSize === ts.key}
            aria-label={`Text size ${ts.key}`}
          >
            {ts.label}
          </button>
        ))}
      </div>

      {/* High contrast toggle */}
      <button
        onClick={handleContrast}
        className={btnBase}
        style={{
          borderColor: '#2B579A',
          backgroundColor: highContrast ? '#2B579A' : 'transparent',
          color: highContrast ? '#FFFFFF' : '#2B579A',
        }}
        aria-pressed={highContrast}
        aria-label="Toggle high contrast"
      >
        High Contrast
      </button>

      {/* Audio toggle */}
      <button
        onClick={handleAudio}
        className={btnBase}
        style={{
          borderColor: '#2B579A',
          backgroundColor: audioEnabled ? '#2B579A' : 'transparent',
          color: audioEnabled ? '#FFFFFF' : '#2B579A',
        }}
        aria-pressed={audioEnabled}
        aria-label={audioEnabled ? 'Audio on' : 'Audio off'}
      >
        {audioEnabled ? 'Audio On' : 'Audio Off'}
      </button>

      {/* Speech rate slider — only shown when audio is on */}
      {audioEnabled && (
        <div className="flex items-center gap-2">
          <label htmlFor="speech-rate" className="text-sm text-gray-600 whitespace-nowrap">
            Speed: {speechRate.toFixed(1)}x
          </label>
          <input
            id="speech-rate"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speechRate}
            onChange={handleSpeechRate}
            className="w-24 accent-[#2B579A]"
            aria-label={`Speech rate ${speechRate.toFixed(1)}x`}
          />
        </div>
      )}
    </div>
  );
}
