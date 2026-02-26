import { useEffect, useRef, useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';

export default function HandoverSuggestion({ suggestion, onAccept, onDismiss }) {
  const { logEvent } = useEventLogger();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  // Show/hide animation
  useEffect(() => {
    if (suggestion) {
      setExiting(false);
      // Slide in after a frame
      requestAnimationFrame(() => setVisible(true));
      logEvent(EventTypes.HANDOVER_SUGGESTION_SHOWN, Actors.RESEARCHER, { suggestion });

      // Auto-dismiss after 15 seconds
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, 15000);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    } else {
      setVisible(false);
      setExiting(false);
    }
  }, [suggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    logEvent(EventTypes.HANDOVER_SUGGESTION_DISMISSED, Actors.CREATOR, { suggestion });
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      onDismiss();
    }, 300);
  }, [suggestion, logEvent, onDismiss]);

  const handleAccept = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    logEvent(EventTypes.HANDOVER_SUGGESTION_ACCEPTED, Actors.CREATOR, { suggestion });
    setVisible(false);
    onAccept();
  }, [suggestion, logEvent, onAccept]);

  if (!suggestion) return null;

  return (
    <div
      className="fixed top-4 right-4 z-40 max-w-sm"
      style={{
        transform: visible && !exiting ? 'translateX(0)' : 'translateX(120%)',
        transition: 'transform 0.3s ease-in-out',
      }}
      role="alert"
      aria-live="polite"
      aria-label="Handover suggestion"
    >
      <div
        className="rounded-lg shadow-lg border-2 p-4"
        style={{ backgroundColor: '#FFF8F0', borderColor: '#E67E22' }}
      >
        <div className="flex items-start gap-2 mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E67E22" strokeWidth="2" className="shrink-0 mt-0.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-gray-800">
            This might be a good time to ask your helper to{' '}
            <strong>{suggestion}</strong>
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-100 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-gray-400"
            aria-label="Dismiss suggestion"
          >
            Dismiss
          </button>
          <button
            onClick={handleAccept}
            className="px-3 py-1.5 rounded text-xs font-bold text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2 focus:outline-orange-400"
            style={{ backgroundColor: '#E67E22' }}
            aria-label="Accept suggestion and open intent locker"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
