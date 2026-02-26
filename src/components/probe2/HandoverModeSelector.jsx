import { useEffect, useRef, useCallback } from 'react';
import { announce } from '../../utils/announcer.js';

export default function HandoverModeSelector({ onSelectMode, onCancel, markCount }) {
  const dialogRef = useRef(null);
  const firstButtonRef = useRef(null);

  // Focus first button on mount
  useEffect(() => {
    firstButtonRef.current?.focus();
    announce('Choose handover mode dialog opened');
  }, []);

  // Escape key to close
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
    // Trap focus within dialog
    if (e.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onCancel]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Choose handover mode"
      onKeyDown={handleKeyDown}
      className="bg-white border border-gray-200 rounded-lg p-6 shadow-lg max-w-md mx-auto"
    >
      <h2 className="text-lg font-bold mb-2" style={{ color: '#1F3864' }}>
        Hand Over to Helper
      </h2>
      <p className="text-sm text-gray-600 mb-5">
        How would you like to collaborate with your helper?
      </p>

      <div className="space-y-3">
        {/* Mark-then-handover */}
        <button
          ref={firstButtonRef}
          onClick={() => {
            announce('Handing over task list to helper');
            onSelectMode('tasks');
          }}
          className="w-full text-left p-4 rounded-lg border-2 transition-colors hover:border-orange-400 focus:outline-2 focus:outline-offset-2 focus:outline-orange-400"
          style={{ borderColor: markCount > 0 ? '#E67E22' : '#D1D5DB' }}
          aria-label={`Hand over tasks. ${markCount} marked segments.`}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex items-center justify-center w-10 h-10 rounded-full text-white shrink-0"
              style={{ backgroundColor: '#E67E22' }}
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </span>
            <div>
              <p className="font-bold text-sm" style={{ color: '#1F3864' }}>
                Hand Over Tasks
              </p>
              <p className="text-xs text-gray-500">
                Send your {markCount} marked segment{markCount !== 1 ? 's' : ''} with voice notes as a task list
              </p>
            </div>
          </div>
        </button>

        {/* Live handover */}
        <button
          onClick={() => {
            announce('Starting live collaboration with helper');
            onSelectMode('live');
          }}
          className="w-full text-left p-4 rounded-lg border-2 border-gray-300 transition-colors hover:border-blue-400 focus:outline-2 focus:outline-offset-2 focus:outline-blue-400"
          aria-label="Work together with helper in real-time"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex items-center justify-center w-10 h-10 rounded-full text-white shrink-0"
              style={{ backgroundColor: '#2B579A' }}
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <div>
              <p className="font-bold text-sm" style={{ color: '#1F3864' }}>
                Work Together
              </p>
              <p className="text-xs text-gray-500">
                Collaborate in real-time — guide your helper as they make changes
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
