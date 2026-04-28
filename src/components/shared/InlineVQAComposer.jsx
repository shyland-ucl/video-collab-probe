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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuestion(input);
    }
  };

  return (
    <div className="flex gap-2 mt-2">
      <button
        ref={voiceButtonRef}
        onClick={toggleListening}
        aria-label={isListening ? 'Stop listening' : 'Voice input — speak your question'}
        aria-pressed={isListening}
        className={`flex items-center justify-center rounded transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
          isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
        style={{ minHeight: '44px', minWidth: '44px' }}
        disabled={disabled}
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
        className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
        style={{ minHeight: '44px' }}
        aria-label="Type a question about this scene"
        disabled={disabled}
      />
      <button
        onClick={() => submitQuestion(input)}
        disabled={!input.trim() || disabled}
        aria-label="Send question"
        className="px-4 py-2 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ backgroundColor: accentColor, minHeight: '44px' }}
      >
        Ask
      </button>
    </div>
  );
}
