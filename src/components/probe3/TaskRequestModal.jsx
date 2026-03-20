import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { announce } from '../../utils/announcer.js';

export default function TaskRequestModal({ route, segment, onSend, onClose, pendingAIResponse, aiResponse }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const modalRef = useRef(null);
  const inputRef = useRef(null);

  const isAI = route === 'ai';
  const title = isAI ? 'Ask AI' : 'Ask Helper';
  const isPending = isAI && pendingAIResponse;

  // Focus trap: inert on #root
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.setAttribute('inert', '');
    setTimeout(() => inputRef.current?.focus(), 100);
    return () => {
      if (root) root.removeAttribute('inert');
    };
  }, []);

  // Voice input (Web Speech API — same pattern as VQAPanel)
  const toggleListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      announce('Voice input not available on this device.');
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setText(transcript);
      setListening(false);
      announce(`Heard: ${transcript}`);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognition.start();
    setListening(true);
    announce('Listening...');
  }, [listening]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    if (!isAI) {
      // Helper route: close immediately
      onClose();
    }
    // AI route: modal stays open, waiting for response
    setText('');
  }, [text, onSend, onClose, isAI]);

  return createPortal(
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-bold text-sm text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-3 py-1.5 rounded text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 focus:outline-2 focus:outline-blue-500"
            style={{ minHeight: '44px', minWidth: '44px' }}
            aria-label="Close"
          >
            Done
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* Segment context */}
          {segment && (
            <p className="text-xs text-gray-500">
              Clip: <span className="font-semibold text-gray-700">{segment.name}</span>
              {' '}({Math.floor(segment.start_time / 60)}:{String(Math.floor(segment.start_time % 60)).padStart(2, '0')}
              {' '}&ndash;{' '}
              {Math.floor(segment.end_time / 60)}:{String(Math.floor(segment.end_time % 60)).padStart(2, '0')})
            </p>
          )}

          {/* Text input + voice button */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              placeholder="Describe what you want done..."
              disabled={isPending}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-2 focus:outline-[#9B59B6] disabled:opacity-50"
              style={{ minHeight: '48px' }}
              aria-label="Task description"
            />
            <button
              onClick={toggleListening}
              disabled={isPending}
              className={`px-3 py-2 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                listening
                  ? 'bg-red-500 text-white focus:ring-red-400'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400'
              } disabled:opacity-40`}
              style={{ minHeight: '48px', minWidth: '48px' }}
              aria-label={listening ? 'Stop listening' : 'Voice input'}
            >
              {listening ? '...' : 'Mic'}
            </button>
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || isPending}
            className="w-full py-3 rounded-lg text-sm font-bold text-white disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{
              minHeight: '48px',
              backgroundColor: isAI ? '#9B59B6' : '#E67E22',
              '--tw-ring-color': isAI ? '#9B59B6' : '#E67E22',
            }}
            aria-label="Send task"
          >
            Send
          </button>

          {/* AI pending state */}
          {isPending && (
            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg" role="status" aria-live="polite">
              <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              <span className="text-sm text-purple-700 font-medium">AI is working on this...</span>
            </div>
          )}

          {/* AI response */}
          {aiResponse && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg" role="status" aria-live="polite">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">AI Result</p>
              <p className="text-sm text-gray-800">{aiResponse}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
