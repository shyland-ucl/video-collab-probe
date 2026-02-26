import { useEffect, useRef } from 'react';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import ttsService from '../../services/ttsService.js';

const textSizeClasses = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
};

export default function DescriptionPanel({ segment, level }) {
  const { textSize, audioEnabled, speechRate } = useAccessibility();
  const { logEvent } = useEventLogger();
  const prevKeyRef = useRef(null);

  const description = segment?.descriptions?.[`level_${level}`] || null;
  const key = segment ? `${segment.id}-${level}` : null;

  // When description changes (new segment or new level), log and optionally speak
  useEffect(() => {
    if (!key || key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    logEvent(EventTypes.DESCRIPTION_VIEWED, Actors.CREATOR, {
      segmentId: segment.id,
      level,
    });

    if (audioEnabled && description) {
      ttsService.speak(description, { rate: speechRate });
    }
  }, [key, segment, level, description, audioEnabled, speechRate, logEvent]);

  const sizeClass = textSizeClasses[textSize] || 'text-base';

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
      aria-live="polite"
      aria-label="Video description"
    >
      {segment ? (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            <h3 className="text-sm font-semibold text-gray-700">{segment.name}</h3>
          </div>
          <p className={`${sizeClass} text-gray-800 leading-relaxed whitespace-pre-line`}>
            {description}
          </p>
        </>
      ) : (
        <p className="text-gray-400 text-sm">
          Play the video to see AI descriptions for each segment.
        </p>
      )}
    </div>
  );
}
