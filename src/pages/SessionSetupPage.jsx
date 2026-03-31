import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { wsRelayService } from '../services/wsRelayService.js';

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

  const [dyadId, setDyadId] = useState('');
  const [waiting, setWaiting] = useState(false);

  // Restore dyad ID from localStorage if exists
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      if (stored) {
        const config = JSON.parse(stored);
        if (config.dyadId) setDyadId(config.dyadId);
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for NAVIGATE messages when waiting
  useEffect(() => {
    if (!waiting) return;

    const unsubData = wsRelayService.onData((msg) => {
      if (msg.type === 'NAVIGATE' && msg.path) {
        navigate(msg.path);
      }
    });

    return () => {
      unsubData();
    };
  }, [waiting, navigate]);

  const handleStart = useCallback(() => {
    if (!dyadId.trim()) return;

    const sessionId = generateUUID();
    const config = {
      sessionId,
      dyadId: dyadId.trim(),
      conditionOrder: ['probe1', 'probe2a', 'probe2b', 'probe3'],
      completedConditions: [],
      startedAt: new Date().toISOString(),
    };

    localStorage.setItem('sessionConfig', JSON.stringify(config));

    setCondition(null);
    logEvent(EventTypes.SESSION_START, Actors.RESEARCHER, {
      sessionId,
      dyadId: dyadId.trim(),
      conditionOrder: config.conditionOrder,
    });

    // Connect as participant and wait for researcher navigation
    wsRelayService.connect('participant');
    setWaiting(true);
  }, [dyadId, logEvent, setCondition]);

  if (waiting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ backgroundColor: '#1F3864' }}
            aria-hidden="true"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1
            className="text-xl font-bold mb-2"
            style={{ color: '#1F3864' }}
          >
            Ready
          </h1>
          <p
            className="text-gray-600 text-base"
            role="status"
            aria-live="polite"
          >
            Waiting for the researcher to begin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div
        className="w-full px-4 py-3"
        style={{ backgroundColor: '#1F3864' }}
        role="banner"
      >
        <h1 className="text-white font-bold text-lg">Session Setup</h1>
      </div>

      <div className="max-w-xl mx-auto mt-8 px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
              aria-required="true"
              required
            />
          </div>

          <button
            onClick={handleStart}
            disabled={!dyadId.trim()}
            className="w-full py-3 rounded text-white font-bold text-base transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            style={{ backgroundColor: '#1F3864', minHeight: '48px' }}
          >
            Start Session
          </button>
        </div>

        <div className="mt-4 text-center text-sm text-gray-400">
          <a
            href="/researcher"
            className="underline hover:text-gray-600 focus:outline-2 focus:outline-blue-500"
          >
            Researcher Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
