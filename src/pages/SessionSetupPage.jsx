import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';

const CONDITIONS = [
  { key: 'baseline', label: 'Baseline', path: '/baseline' },
  { key: 'probe1', label: 'Probe 1: AI Description', path: '/probe1' },
  { key: 'probe2', label: 'Probe 2: Smart Handover', path: '/probe2' },
  { key: 'probe3', label: 'Probe 3: Local Mirroring', path: '/probe3' },
];

function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function SessionSetupPage() {
  const navigate = useNavigate();
  const { logEvent, setCondition } = useEventLogger();
  const {
    textSize, setTextSize,
    highContrast, toggleContrast,
    audioEnabled, toggleAudio,
    speechRate, setSpeechRate,
  } = useAccessibility();

  const [sessionId, setSessionId] = useState(() => generateUUID());
  const [dyadId, setDyadId] = useState('');
  const [conditionOrder, setConditionOrder] = useState([0, 1, 2, 3]);

  // Restore from localStorage if exists
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      if (stored) {
        const config = JSON.parse(stored);
        if (config.sessionId) setSessionId(config.sessionId);
        if (config.dyadId) setDyadId(config.dyadId);
        if (config.conditionOrder) {
          // conditionOrder may be stored as string keys — convert back to indices
          const restored = config.conditionOrder.map((entry) => {
            if (typeof entry === 'number') return entry;
            const idx = CONDITIONS.findIndex((c) => c.key === entry);
            return idx >= 0 ? idx : null;
          }).filter((i) => i !== null);
          if (restored.length === CONDITIONS.length) setConditionOrder(restored);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleOrderChange = useCallback((posIndex, newCondIndex) => {
    setConditionOrder((prev) => {
      const next = [...prev];
      // Find which position currently has this condition and swap
      const existingPos = next.indexOf(newCondIndex);
      if (existingPos >= 0) {
        next[existingPos] = next[posIndex];
      }
      next[posIndex] = newCondIndex;
      return next;
    });
  }, []);

  const handleStart = useCallback(() => {
    if (!dyadId.trim()) return;

    const config = {
      sessionId,
      dyadId: dyadId.trim(),
      conditionOrder: conditionOrder.map((i) => CONDITIONS[i].key),
      completedConditions: [],
      startedAt: new Date().toISOString(),
    };

    localStorage.setItem('sessionConfig', JSON.stringify(config));

    // Log session start
    setCondition(null);
    logEvent(EventTypes.SESSION_START, Actors.RESEARCHER, {
      sessionId,
      dyadId: dyadId.trim(),
      conditionOrder: config.conditionOrder,
    });

    // Navigate to first condition
    const firstCondition = CONDITIONS[conditionOrder[0]];
    navigate(firstCondition.path);
  }, [sessionId, dyadId, conditionOrder, logEvent, setCondition, navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div
        className="w-full px-4 py-3"
        style={{ backgroundColor: '#1F3864' }}
        role="banner"
        aria-label="Session setup"
      >
        <h1 className="text-white font-bold text-lg">Video Collaboration Research Tool</h1>
        <p className="text-white/70 text-sm">Session Setup</p>
      </div>

      {/* Setup form */}
      <div className="max-w-xl mx-auto mt-8 px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2
            className="text-xl font-bold mb-6"
            style={{ color: '#1F3864' }}
          >
            New Study Session
          </h2>

          {/* Session ID */}
          <div className="mb-5">
            <label
              htmlFor="session-id"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Session ID
            </label>
            <input
              id="session-id"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
              aria-label="Session ID"
            />
            <p className="text-xs text-gray-400 mt-1">Auto-generated UUID. Edit if needed.</p>
          </div>

          {/* Dyad ID */}
          <div className="mb-5">
            <label
              htmlFor="dyad-id"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Participant Dyad ID <span className="text-red-500">*</span>
            </label>
            <input
              id="dyad-id"
              type="text"
              value={dyadId}
              onChange={(e) => setDyadId(e.target.value)}
              placeholder="e.g. D01, D02..."
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
              aria-label="Participant Dyad ID"
              aria-required="true"
              required
            />
          </div>

          {/* Condition Order */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Condition Order</p>
            <p className="text-xs text-gray-400 mb-3">
              Set the order in which conditions will be presented. Use the dropdowns to reorder.
            </p>
            <div className="space-y-2">
              {conditionOrder.map((condIndex, posIndex) => (
                <div key={posIndex} className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 flex items-center justify-center rounded-full text-white text-sm font-bold"
                    style={{ backgroundColor: '#1F3864' }}
                    aria-hidden="true"
                  >
                    {posIndex + 1}
                  </span>
                  <select
                    value={condIndex}
                    onChange={(e) =>
                      handleOrderChange(posIndex, parseInt(e.target.value, 10))
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
                    aria-label={`Condition for position ${posIndex + 1}`}
                  >
                    {CONDITIONS.map((cond, i) => (
                      <option key={cond.key} value={i}>
                        {cond.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Accessibility Preferences */}
          <div className="mb-6">
            <h3
              className="text-sm font-bold mb-3"
              style={{ color: '#1F3864' }}
            >
              Accessibility Preferences
            </h3>

            {/* Text Size */}
            <fieldset className="mb-4">
              <legend className="text-sm font-medium text-gray-700 mb-2">Text Size</legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Text size">
                {['small', 'medium', 'large'].map((size) => (
                  <button
                    key={size}
                    onClick={() => setTextSize(size)}
                    className={`px-4 py-2 rounded text-sm font-medium border transition-colors focus:outline-2 focus:outline-blue-500 ${
                      textSize === size
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                    role="radio"
                    aria-checked={textSize === size}
                    aria-label={`${size} text`}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* High Contrast */}
            <div className="mb-4 flex items-center justify-between">
              <label htmlFor="high-contrast" className="text-sm font-medium text-gray-700">
                High Contrast Mode
              </label>
              <button
                id="high-contrast"
                onClick={toggleContrast}
                className={`relative w-14 h-8 rounded-full transition-colors focus:outline-2 focus:outline-blue-500 ${
                  highContrast ? 'bg-blue-900' : 'bg-gray-300'
                }`}
                style={{ minHeight: '44px', minWidth: '44px' }}
                role="switch"
                aria-checked={highContrast}
                aria-label="High contrast mode"
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    highContrast ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>

            {/* Audio Descriptions */}
            <div className="mb-4 flex items-center justify-between">
              <label htmlFor="audio-desc" className="text-sm font-medium text-gray-700">
                Audio Descriptions
              </label>
              <button
                id="audio-desc"
                onClick={toggleAudio}
                className={`relative w-14 h-8 rounded-full transition-colors focus:outline-2 focus:outline-blue-500 ${
                  audioEnabled ? 'bg-blue-900' : 'bg-gray-300'
                }`}
                style={{ minHeight: '44px', minWidth: '44px' }}
                role="switch"
                aria-checked={audioEnabled}
                aria-label="Audio descriptions"
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    audioEnabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>

            {/* Speech Rate */}
            {audioEnabled && (
              <div className="mb-4">
                <label htmlFor="speech-rate" className="block text-sm font-medium text-gray-700 mb-1">
                  Speech Rate: {speechRate.toFixed(1)}x
                </label>
                <input
                  id="speech-rate"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="w-full accent-blue-900"
                  aria-label={`Speech rate: ${speechRate.toFixed(1)}x`}
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0.5x Slow</span>
                  <span>1.0x Normal</span>
                  <span>2.0x Fast</span>
                </div>
              </div>
            )}
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!dyadId.trim()}
            className="w-full py-3 rounded text-white font-bold text-base transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            style={{ backgroundColor: '#1F3864', minHeight: '44px' }}
            aria-label="Start study session"
          >
            Start Session
          </button>
        </div>

        {/* Quick links */}
        <div className="mt-4 text-center text-sm text-gray-400">
          <a
            href="/researcher"
            className="underline hover:text-gray-600 focus:outline-2 focus:outline-blue-500"
            aria-label="Go to researcher dashboard"
          >
            Researcher Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
