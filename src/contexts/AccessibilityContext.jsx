import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';

const AccessibilityContext = createContext(null);

const STORAGE_KEY = 'accessibilitySettings';

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

const defaults = {
  textSize: 'medium',
  highContrast: false,
  audioEnabled: false,
  speechRate: 1.2,
};

const initialState = { ...defaults, ...loadFromStorage() };

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TEXT_SIZE':
      return { ...state, textSize: action.payload };
    case 'TOGGLE_CONTRAST':
      return { ...state, highContrast: !state.highContrast };
    case 'TOGGLE_AUDIO':
      return { ...state, audioEnabled: !state.audioEnabled };
    case 'SET_SPEECH_RATE':
      return { ...state, speechRate: action.payload };
    default:
      return state;
  }
}

export function AccessibilityProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Persist to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setTextSize = useCallback((size) => {
    dispatch({ type: 'SET_TEXT_SIZE', payload: size });
  }, []);

  const toggleContrast = useCallback(() => {
    dispatch({ type: 'TOGGLE_CONTRAST' });
  }, []);

  const toggleAudio = useCallback(() => {
    dispatch({ type: 'TOGGLE_AUDIO' });
  }, []);

  const setSpeechRate = useCallback((rate) => {
    dispatch({ type: 'SET_SPEECH_RATE', payload: rate });
  }, []);

  const value = {
    ...state,
    setTextSize,
    toggleContrast,
    toggleAudio,
    setSpeechRate,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}
