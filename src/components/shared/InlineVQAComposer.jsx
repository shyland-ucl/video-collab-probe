import { useState, useRef, useCallback, useEffect } from 'react';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';

export default function InlineVQAComposer({ onSubmit, disabled, accentColor = '#2B579A' }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const voiceButtonRef = useRef(null);

  // Auto-focus the voice-input button on mount. The composer is rendered
  // only when its parent's "Ask AI" panel opens, so mount === panel-opened.
  // Voice is the primary BLV interaction; landing on it skips one swipe
  // for the user. They can still swipe right once to reach the text input
  // for keyboard / Gboard mic dictation.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      voiceButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // When `disabled` flips back to false (the AI answer arrived) restore
  // focus to the voice button so the participant stays anchored in the
  // composer instead of being thrown back to the page header by TalkBack.
  // The previous `disabled` HTML attribute was the trigger: disabling the
  // currently-focused element drops focus to <body>; we now only signal
  // disablement via aria-disabled, but if the activeElement DID move
  // (e.g. they tapped elsewhere mid-pending) we still rebound here.
  const wasDisabledRef = useRef(disabled);
  useEffect(() => {
    if (wasDisabledRef.current && !disabled) {
      const raf = requestAnimationFrame(() => {
        if (document.activeElement === document.body || !document.activeElement) {
          voiceButtonRef.current?.focus();
        }
      });
      wasDisabledRef.current = false;
      return () => cancelAnimationFrame(raf);
    }
    wasDisabledRef.current = disabled;
    return undefined;
  }, [disabled]);

  const submitQuestion = useCallback(
    (text) => {
      if (!text.trim() || disabled) return;
      onSubmit(text.trim());
      setInput('');
    },
    [onSubmit, disabled]
  );

  const { isListening, toggleListening } = useSpeechRecognition({
    onResult: submitQuestion,
    announcement: 'Listening for your question.',
  });

  const handleVoiceClick = useCallback(() => {
    if (disabled) return;
    toggleListening();
  }, [disabled, toggleListening]);

  const handleAskClick = useCallback(() => {
    if (disabled) return;
    submitQuestion(input);
  }, [disabled, input, submitQuestion]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuestion(input);
    }
  };

  // We use aria-disabled instead of the `disabled` HTML attribute on the
  // voice and ask buttons so the focused element is not blurred when an
  // AI request is in flight. Disabling a focused element drops focus to
  // <body> in Chromium and TalkBack, which is exactly the regression the
  // participant reported ("focus jumps to the whole interface and I have
  // to re-navigate"). The buttons remain focusable; click handlers above
  // gate by `disabled` so a tap during pending is a no-op.
  const askDisabled = !input.trim() || disabled;
  return (
    <div className="flex gap-2 mt-2">
      <button
        ref={voiceButtonRef}
        onClick={handleVoiceClick}
        aria-label={isListening ? 'Stop listening' : 'Voice input — speak your question'}
        aria-pressed={isListening}
        aria-disabled={disabled || undefined}
        className={`flex items-center justify-center rounded transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
          isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        style={{ minHeight: '44px', minWidth: '44px' }}
      >
        <svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <rect x="7" y="1" width="4" height="10" rx="2" />
          <path d="M4 8a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="9" y1="14" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about this scene..."
        className={`flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500 ${
          disabled ? 'opacity-60' : ''
        }`}
        style={{ minHeight: '44px' }}
        aria-label="Type a question about this scene"
        readOnly={disabled}
      />
      <button
        onClick={handleAskClick}
        aria-label="Send question"
        aria-disabled={askDisabled || undefined}
        className={`px-4 py-2 rounded text-white text-sm font-medium transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
          askDisabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        style={{ backgroundColor: accentColor, minHeight: '44px' }}
      >
        Ask
      </button>
    </div>
  );
}
