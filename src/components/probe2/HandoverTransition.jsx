import { useEffect, useRef } from 'react';

function playHandoverSound(audioCtx) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.setValueAtTime(400, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

function playReturnSound(audioCtx) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

export default function HandoverTransition({ direction, onComplete, onCancel }) {
  const audioCtxRef = useRef(null);

  const isToHelper = direction === 'toHelper';
  const fromColor = isToHelper ? '#2B579A' : '#E67E22';
  const toColor = isToHelper ? '#E67E22' : '#2B579A';
  const text = isToHelper ? 'Handing over to Helper...' : 'Returning to Creator...';
  // m12: only the toHelper transition is cancellable. The toCreator transition
  // is the helper *returning* the device, which they've already committed to
  // by tapping Return Device — undoing that mid-flight is a different feature.
  const canCancel = isToHelper && typeof onCancel === 'function';

  useEffect(() => {
    // Play earcon
    try {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (isToHelper) {
        playHandoverSound(audioCtxRef.current);
      } else {
        playReturnSound(audioCtxRef.current);
      }
    } catch (e) {
      // Audio not supported, continue silently
    }

    // m12: 1 second was too short for a creator who realised mid-handover
    // they'd picked the wrong scene or task to react. Extended to 2.5 s so
    // a Cancel tap is feasible. The transition still feels snappy because
    // the visual fade happens in the first 1 s; the remaining time is
    // a "are you sure?" buffer with the Cancel button on screen.
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => {
      clearTimeout(timer);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [direction, isToHelper, onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="alert"
      aria-live="assertive"
      aria-label={text}
      style={{
        background: `linear-gradient(135deg, ${fromColor} 0%, ${toColor} 100%)`,
        animation: 'handoverFade 1s ease-in-out',
      }}
    >
      <style>{`
        @keyframes handoverFade {
          0% { opacity: 0; transform: scale(0.95); }
          20% { opacity: 1; transform: scale(1); }
          80% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        @keyframes handoverPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
      <div
        className="text-center"
        style={{ animation: 'handoverPulse 0.5s ease-in-out infinite' }}
      >
        <div className="text-white text-4xl font-bold mb-4">
          {isToHelper ? (
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="mx-auto mb-4" aria-hidden="true">
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          ) : (
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="mx-auto mb-4" aria-hidden="true">
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            </svg>
          )}
        </div>
        <p className="text-white text-2xl font-semibold">{text}</p>
        {canCancel && (
          <button
            onClick={onCancel}
            className="mt-6 px-6 py-3 bg-white/20 hover:bg-white/30 text-white text-base font-bold rounded-lg border-2 border-white/40 focus:outline-2 focus:outline-offset-2 focus:outline-white"
            style={{ minHeight: '48px' }}
            aria-label="Cancel handover and return to creator mode"
          >
            Cancel handover
          </button>
        )}
      </div>
    </div>
  );
}
