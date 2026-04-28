import { useState, useRef, useEffect } from 'react';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';
import { announce } from '../../utils/announcer.js';

export default function TaskRouterPanel({
  onSubmit,
  submitLabel = 'Send',
  accentColor = '#5CB85C',
}) {
  const [taskText, setTaskText] = useState('');
  const voiceButtonRef = useRef(null);

  // Land focus on the voice-input button as soon as the panel opens — for a
  // BLV creator the fastest path is "tap, speak", and the voice button is
  // the implicit next action. The text input is one Tab away if they prefer
  // typing.
  useEffect(() => {
    voiceButtonRef.current?.focus();
  }, []);

  const { isListening, toggleListening } = useSpeechRecognition({
    onResult: (transcript) => setTaskText(transcript),
    announcement: 'Listening for your instruction.',
  });

  const handleSubmit = () => {
    if (!taskText.trim()) {
      announce('Please describe the task.');
      return;
    }
    onSubmit({ instruction: taskText });
    setTaskText('');
  };

  return (
    <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 space-y-3">
      <div className="flex gap-2">
        <button
          ref={voiceButtonRef}
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Voice input — speak your instruction'}
          aria-pressed={isListening}
          className={`flex items-center justify-center rounded transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
            isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
            <rect x="7" y="1" width="4" height="10" rx="2" />
            <path d="M4 8a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="14" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <input
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="Describe the task..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
          aria-label="Task instruction"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!taskText.trim()}
        className="w-full py-3 text-sm font-bold rounded text-white transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ backgroundColor: accentColor, minHeight: '48px' }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
