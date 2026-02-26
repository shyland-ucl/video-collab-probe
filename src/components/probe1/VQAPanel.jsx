import { useState, useRef, useEffect, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import ttsService from '../../services/ttsService.js';

export default function VQAPanel({ onQuestion }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const { logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();

  // Expose global function for WoZ to send answers
  useEffect(() => {
    window.__vqaReceiveAnswer = (answer) => {
      setThinking(false);
      setMessages((prev) => [...prev, { role: 'ai', text: answer }]);
      logEvent(EventTypes.VQA_ANSWER, Actors.AI, { answer });
      if (audioEnabled) {
        ttsService.speak(answer, { rate: speechRate });
      }
    };
    return () => {
      delete window.__vqaReceiveAnswer;
    };
  }, [logEvent, audioEnabled, speechRate]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setThinking(true);
    logEvent(EventTypes.VQA_QUESTION, Actors.CREATOR, { question: text });

    if (onQuestion) {
      onQuestion(text);
    }
  }, [input, logEvent, onQuestion]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Speech-to-text
  const toggleListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col" style={{ maxHeight: '400px' }}>
      {/* Header */}
      <div
        className="px-4 py-2 rounded-t-lg"
        style={{ backgroundColor: '#1F3864' }}
      >
        <h3 className="text-white font-semibold text-sm">Ask About the Video</h3>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ minHeight: '120px' }}
        aria-live="polite"
        aria-label="VQA conversation"
      >
        {messages.length === 0 && !thinking && (
          <p className="text-gray-400 text-sm text-center py-4">
            Ask a question about the video content
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
              style={msg.role === 'user' ? { backgroundColor: '#2B579A' } : undefined}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-lg text-sm italic">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a question..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
          aria-label="Type a question about the video"
        />
        <button
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Start voice input'}
          title={isListening ? 'Stop listening' : 'Voice input'}
          className={`px-2 py-2 rounded transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
            isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
            <rect x="7" y="1" width="4" height="10" rx="2" />
            <path d="M4 8a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="14" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          onClick={handleSubmit}
          disabled={!input.trim()}
          aria-label="Send question"
          className="px-4 py-2 rounded text-white text-sm font-medium transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: '#2B579A' }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}
