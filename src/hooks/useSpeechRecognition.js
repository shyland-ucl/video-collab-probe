import { useState, useRef, useCallback } from 'react';
import { announce } from '../utils/announcer.js';

export default function useSpeechRecognition({
  lang = 'en-GB',
  onResult,
  announcement = 'Listening...',
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      announce('Voice input is not supported in this browser.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      onResult(transcript);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      // Chrome on Android refuses microphone access on insecure origins
      // (anything that isn't HTTPS or localhost) and surfaces it as
      // 'not-allowed' before even prompting the user. Detect that case
      // and tell the user the actionable thing — "switch to HTTPS" — not
      // the misleading "permission denied".
      const insecure =
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location?.hostname !== 'localhost' &&
        window.location?.hostname !== '127.0.0.1';
      const messages = {
        'not-allowed': insecure
          ? 'Voice input requires a secure HTTPS connection. Please reopen this page over HTTPS, or use the keyboard microphone instead.'
          : 'Microphone access denied. Please allow microphone permissions in your browser settings.',
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'No microphone found. Please check your audio device.',
        'network': 'Network error during speech recognition. Please check your connection.',
        'service-not-allowed': insecure
          ? 'Voice input requires a secure HTTPS connection.'
          : 'Speech recognition service unavailable.',
      };
      const msg = messages[event.error];
      if (msg) announce(msg);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    announce(announcement);
  }, [isListening, lang, onResult, announcement]);

  return { isListening, toggleListening };
}
