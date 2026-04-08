import { createContext, useContext, useReducer, useCallback, useRef, useMemo } from 'react';
import { EventTypes, Actors } from '../utils/eventTypes.js';

const EventLoggerContext = createContext(null);

const initialState = {
  events: [],
  currentCondition: null,
  sessionStart: Date.now(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOG_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'SET_CONDITION':
      return { ...state, currentCondition: action.payload };
    case 'CLEAR_EVENTS':
      return { ...state, events: [] };
    case 'RESET_SESSION':
      return { ...initialState, sessionStart: Date.now() };
    default:
      return state;
  }
}

export function EventLoggerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const videoTimeRef = useRef(0);
  const sessionStartRef = useRef(state.sessionStart);
  const conditionRef = useRef(state.currentCondition);
  sessionStartRef.current = state.sessionStart;
  conditionRef.current = state.currentCondition;

  const logEvent = useCallback((eventType, actor, data = {}) => {
    const event = {
      timestamp: Date.now() - sessionStartRef.current,
      eventType,
      actor,
      data,
      videoTimestamp: videoTimeRef.current,
      condition: conditionRef.current,
    };
    dispatch({ type: 'LOG_EVENT', payload: event });
  }, []);

  const setCondition = useCallback((condition) => {
    dispatch({ type: 'SET_CONDITION', payload: condition });
  }, []);

  const setVideoTime = useCallback((time) => {
    videoTimeRef.current = time;
  }, []);

  const getEvents = useCallback((condition) => {
    if (!condition) return state.events;
    return state.events.filter((e) => e.condition === condition);
  }, [state.events]);

  const clearEvents = useCallback(() => {
    dispatch({ type: 'CLEAR_EVENTS' });
  }, []);

  const value = useMemo(() => ({
    events: state.events,
    currentCondition: state.currentCondition,
    sessionStart: state.sessionStart,
    logEvent,
    setCondition,
    setVideoTime,
    getEvents,
    clearEvents,
  }), [state.events, state.currentCondition, state.sessionStart, logEvent, setCondition, setVideoTime, getEvents, clearEvents]);

  return (
    <EventLoggerContext.Provider value={value}>
      {children}
    </EventLoggerContext.Provider>
  );
}

export function useEventLogger() {
  const context = useContext(EventLoggerContext);
  if (!context) {
    throw new Error('useEventLogger must be used within an EventLoggerProvider');
  }
  return context;
}

export { EventTypes, Actors };
