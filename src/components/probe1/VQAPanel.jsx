import { useState, useRef, useEffect, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import ttsService from '../../services/ttsService.js';
import { captureFrame, askGemini } from '../../services/geminiService.js';
import { announce } from '../../utils/announcer.js';

export default function VQAPanel({ onQuestion, playerRef, currentSegment }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const answeredRef = useRef(false);
  const timeoutRef = useRef(null);
  const inputRef = useRef(null);
  const { logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();

  // Expose global function for WoZ to send answers (researcher override)
  useEffect(() => {
    window.__vqaReceiveAnswer = (answer) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      clearTimeout(timeoutRef.current);
      setThinking(false);
      setMessages((prev) => [...prev, { role: 'ai', text: answer, source: 'researcher' }]);
      logEvent(EventTypes.VQA_ANSWER, Actors.RESEARCHER, { answer, source: 'researcher_override' });
      if (audioEnabled) {
        ttsService.speak(answer, { rate: speechRate });
      }
    };
    return () => {
      delete window.__vqaReceiveAnswer;
      clearTimeout(timeoutRef.current);
    };
  }, [logEvent, audioEnabled, speechRate]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const submitQuestion = useCallback((text) => {
    if (!text.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setThinking(true);
    answeredRef.current = false;
    logEvent(EventTypes.VQA_QUESTION, Actors.CREATOR, { question: text });

    if (onQuestion) {
      onQuestion(text);
    }

    // Start a 15s timeout — if no answer arrives, show error
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!answeredRef.current) {
        answeredRef.current = true;
        setThinking(false);
        const errMsg = 'Could not get an answer. A researcher may respond shortly.';
        setMessages((prev) => [...prev, { role: 'ai', text: errMsg, source: 'error' }]);
        announce(errMsg);
      }
    }, 15000);

    // Try Gemini VLM first, fall back to WoZ
    const videoEl = playerRef?.current?.video;
    if (videoEl) {
      const frame = captureFrame(videoEl);
      const segDesc = currentSegment?.descriptions?.level_1 || '';
      askGemini(frame, text, { segmentDescription: segDesc })
        .then((answer) => {
          if (answeredRef.current) return;
          answeredRef.current = true;
          clearTimeout(timeoutRef.current);
          setThinking(false);
          setMessages((prev) => [...prev, { role: 'ai', text: answer, source: 'gemini' }]);
          logEvent(EventTypes.VQA_ANSWER, Actors.AI, { answer, source: 'gemini' });
          if (audioEnabled) {
            ttsService.speak(answer, { rate: speechRate });
          }
        })
        .catch((err) => {
          announce('AI could not answer. Waiting for researcher.');
        });
    }
  }, [logEvent, onQuestion, playerRef, currentSegment, audioEnabled, speechRate]);

  const handleSubmit = useCallback(() => {
    submitQuestion(input.trim());
  }, [input, submitQuestion]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.target.blur();
    }
  }, [handleSubmit]);

  // Speech-to-text — auto-submits after recognition completes
  const toggleListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Fallback: focus the text input so keyboard appears
      inputRef.current?.focus();
      return;
    }

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
      setIsListening(false);
      // Auto-submit the recognized question
      submitQuestion(transcript);
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
  }, [isListening, submitQuestion]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col" style={{ maxHeight: '400px' }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ minHeight: '120px' }}
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 && !thinking && (
          <p className="text-gray-400 text-sm text-center py-4" aria-hidden="true">
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
              role={msg.role === 'ai' ? 'status' : undefined}
              aria-label={msg.role === 'ai' ? `Answer: ${msg.text}` : `Your question: ${msg.text}`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-lg text-sm italic" role="status">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="border-t border-gray-200 p-2 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a question..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
          aria-label="Type a question about the video"
        />
        <button
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Voice input — speak your question'}
          className={`flex items-center justify-center rounded transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500 ${
            isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
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
          style={{ backgroundColor: '#2B579A', minHeight: '44px', minWidth: '44px' }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}
