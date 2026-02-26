import { useState, useEffect, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';

export default function FlagButton({ segmentId, level }) {
  const [flagged, setFlagged] = useState(false);
  const { logEvent } = useEventLogger();

  // Reset when segment changes
  useEffect(() => {
    setFlagged(false);
  }, [segmentId]);

  const handleToggle = useCallback(() => {
    const newState = !flagged;
    setFlagged(newState);
    logEvent(EventTypes.DESCRIPTION_FLAGGED, Actors.CREATOR, {
      segmentId,
      level,
      flagged: newState,
    });
  }, [flagged, segmentId, level, logEvent]);

  // Keyboard shortcut: F key
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'f' || e.key === 'F') {
        handleToggle();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggle]);

  return (
    <button
      aria-pressed={flagged}
      aria-label={flagged ? 'Unflag this description (F)' : 'Flag this description (F)'}
      title={flagged ? 'Unflag description (F)' : 'Flag description (F)'}
      onClick={handleToggle}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-amber-500 ${
        flagged
          ? 'text-white'
          : 'bg-white border-2 text-amber-600 hover:bg-amber-50'
      }`}
      style={
        flagged
          ? { backgroundColor: '#F0AD4E', borderColor: '#F0AD4E' }
          : { borderColor: '#F0AD4E' }
      }
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill={flagged ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M2 1v14M2 1h9l-2 3.5L11 8H2" />
      </svg>
      {flagged ? 'Flagged' : 'Flag'}
    </button>
  );
}
