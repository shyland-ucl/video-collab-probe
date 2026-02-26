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

export default function HandoverTransition({ direction, onComplete }) {
  const audioCtxRef = useRef(null);

  const isToHelper = direction === 'toHelper';
  const fromColor = isToHelper ? '#2B579A' : '#E67E22';
  const toColor = isToHelper ? '#E67E22' : '#2B579A';
  const text = isToHelper ? 'Handing over to Helper...' : 'Returning to Creator...';

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

    // Complete after 1 second
    const timer = setTimeout(() => {
      onComplete();
    }, 1000);

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
      </div>
    </div>
  );
}
