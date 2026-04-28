import { createContext, useContext, useReducer, useCallback, useRef, useMemo, useEffect } from 'react';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { wsRelayService } from '../services/wsRelayService.js';

const EventLoggerContext = createContext(null);

const initialState = {
  events: [],
  eventIds: new Set(),
  currentCondition: null,
  sessionStart: Date.now(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOG_EVENT': {
      // Dedup by event id so re-ingested backlog or duplicate broadcasts
      // can't double-count an interaction.
      if (state.eventIds.has(action.payload.id)) return state;
      const nextIds = new Set(state.eventIds);
      nextIds.add(action.payload.id);
      return { ...state, events: [...state.events, action.payload], eventIds: nextIds };
    }
    case 'INGEST_BACKLOG': {
      const incoming = action.payload.filter((e) => e && e.id && !state.eventIds.has(e.id));
      if (incoming.length === 0) return state;
      const nextIds = new Set(state.eventIds);
      incoming.forEach((e) => nextIds.add(e.id));
      // Re-sort chronologically so a late backlog can't put older events
      // after newer ones in the dashboard log.
      const merged = [...state.events, ...incoming].sort((a, b) => a.timestamp - b.timestamp);
      return { ...state, events: merged, eventIds: nextIds };
    }
    case 'SET_CONDITION':
      return { ...state, currentCondition: action.payload };
    case 'CLEAR_EVENTS':
      return { ...state, events: [], eventIds: new Set() };
    case 'RESET_SESSION':
      return { ...initialState, sessionStart: Date.now(), eventIds: new Set() };
    default:
      return state;
  }
}

function makeEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function EventLoggerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const videoTimeRef = useRef(0);
  const sessionStartRef = useRef(state.sessionStart);
  const conditionRef = useRef(state.currentCondition);
  const eventsRef = useRef(state.events);
  sessionStartRef.current = state.sessionStart;
  conditionRef.current = state.currentCondition;
  eventsRef.current = state.events;

  const logEvent = useCallback((eventType, actor, data = {}) => {
    const now = Date.now();
    const event = {
      id: makeEventId(),
      // Absolute wall-clock timestamp (Unix ms). Stable across tabs and
      // sessions so logs from the dashboard and participant align even when
      // they don't share a sessionStart reference.
      timestamp: now,
      // Relative offset from this tab's session start, kept for backwards
      // compatibility with consumers that expect "time into session".
      sessionOffsetMs: now - sessionStartRef.current,
      eventType,
      actor,
      data,
      videoTimestamp: videoTimeRef.current,
      condition: conditionRef.current,
    };
    dispatch({ type: 'LOG_EVENT', payload: event });
    // Broadcast over the WS relay so the researcher dashboard (and any
    // other tab subscribed to EVENT_LOG) gets a live mirror of every
    // interaction. sendData is a no-op when the socket isn't open, so
    // this is safe to call even on pages that aren't connected.
    try {
      wsRelayService.sendData({ type: 'EVENT_LOG', event });
    } catch { /* ignore */ }
  }, []);

  const ingestRemoteEvent = useCallback((event) => {
    if (!event || !event.id) return;
    dispatch({ type: 'LOG_EVENT', payload: event });
  }, []);

  const ingestEventBacklog = useCallback((events) => {
    if (!Array.isArray(events) || events.length === 0) return;
    dispatch({ type: 'INGEST_BACKLOG', payload: events });
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

  // Persistent WS listener: whenever someone (typically the researcher
  // dashboard) asks for the event backlog, reply with this tab's full log.
  // Registered once at provider mount; survives page transitions because
  // wsRelayService.disconnect() no longer wipes callbacks.
  useEffect(() => {
    const unsub = wsRelayService.onData((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'REQUEST_EVENT_BACKLOG') {
        wsRelayService.sendData({ type: 'EVENT_BACKLOG', events: eventsRef.current });
      }
    });
    return unsub;
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
    ingestRemoteEvent,
    ingestEventBacklog,
  }), [state.events, state.currentCondition, state.sessionStart, logEvent, setCondition, setVideoTime, getEvents, clearEvents, ingestRemoteEvent, ingestEventBacklog]);

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
