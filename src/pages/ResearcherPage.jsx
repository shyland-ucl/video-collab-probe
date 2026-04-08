import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEventLogger } from '../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../utils/eventTypes.js';
import { loadDescriptions } from '../data/sampleDescriptions.js';
import { serialiseProjectState } from '../utils/projectState.js';
import { wsRelayService } from '../services/wsRelayService.js';
import ResearcherVQAPanel from '../components/probe1/ResearcherVQAPanel.jsx';
import ResearcherHandoverPanel from '../components/probe2/ResearcherHandoverPanel.jsx';
import ResearcherSuggestionPanel from '../components/probe3/ResearcherSuggestionPanel.jsx';
import ResearcherMaterialsPanel from '../components/shared/ResearcherMaterialsPanel.jsx';
import DataExportButton from '../components/shared/DataExportButton.jsx';

const COLORS = {
  navy: '#1F3864',
  blue: '#2B579A',
  green: '#5CB85C',
  purple: '#9B59B6',
  grey: '#6B7280',
  amber: '#F0AD4E',
};

const CONDITIONS = [
  { key: 'materials', label: 'Materials', color: COLORS.amber },
  { key: 'probe1', label: 'Probe 1', color: COLORS.blue },
  { key: 'probe2a', label: 'Probe 2a', color: COLORS.green },
  { key: 'probe2b', label: 'Probe 2b', color: COLORS.green },
  { key: 'probe3', label: 'Probe 3', color: COLORS.purple },
];

const ACTOR_COLORS = {
  CREATOR: { bg: '#EBF5FB', text: '#2B579A' },
  HELPER: { bg: '#FEF5E7', text: '#E67E22' },
  AI: { bg: '#EAFAF1', text: '#27AE60' },
  RESEARCHER: { bg: '#FEF9E7', text: '#B7950B' },
  SYSTEM: { bg: '#F2F3F4', text: '#6B7280' },
};

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ResearcherPage() {
  const { events, currentCondition, sessionStart, logEvent, setCondition, clearEvents } = useEventLogger();

  const [elapsed, setElapsed] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [selectedTab, setSelectedTab] = useState('materials');

  // Probe 1 state
  const [data, setData] = useState(null);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [helperFallbackNote, setHelperFallbackNote] = useState('');

  // Probe 2a state
  const [currentMode, setCurrentMode] = useState('creator');
  const [transitionInitiated, setTransitionInitiated] = useState(false);

  // Probe 3 state
  const [seekTime, setSeekTime] = useState('0');
  const [deployedSuggestions, setDeployedSuggestions] = useState({});

  // Event log filters
  const [filterCondition, setFilterCondition] = useState('all');
  const [filterEventType, setFilterEventType] = useState('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeConditions, setActiveConditions] = useState({});

  const logEndRef = useRef(null);
  const logContainerRef = useRef(null);

  // Connect as researcher to WS relay for navigation control
  useEffect(() => {
    wsRelayService.connect('researcher');
    return () => wsRelayService.disconnect();
  }, []);

  useEffect(() => {
    loadDescriptions().then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - sessionStart), 1000);
    return () => clearInterval(timer);
  }, [sessionStart]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  const sessionConfig = useMemo(() => {
    try {
      const stored = localStorage.getItem('sessionConfig');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterCondition !== 'all' && e.condition !== filterCondition) return false;
      if (filterEventType !== 'all' && e.eventType !== filterEventType) return false;
      return true;
    });
  }, [events, filterCondition, filterEventType]);

  const eventTypeOptions = useMemo(() => {
    const types = new Set(events.map((e) => e.eventType));
    return Array.from(types).sort();
  }, [events]);

  // Suggestions for Probe 3
  const videoSuggestions = useMemo(() => {
    if (!data) return [];
    const allVids = data.videos || (data.video ? [data.video] : []);
    for (const v of allVids) {
      if (v.suggestions && v.suggestions.length > 0) return v.suggestions;
    }
    return [];
  }, [data]);

  const handleSessionToggle = useCallback(() => {
    if (sessionActive) {
      logEvent(EventTypes.SESSION_END, Actors.RESEARCHER, { totalEvents: events.length, duration: elapsed });
      setSessionActive(false);
    } else {
      logEvent(EventTypes.SESSION_START, Actors.RESEARCHER, { sessionId: sessionConfig.sessionId, dyadId: sessionConfig.dyadId });
      setSessionActive(true);
    }
  }, [sessionActive, logEvent, events.length, elapsed, sessionConfig]);

  const handleConditionToggle = useCallback((condKey) => {
    setActiveConditions((prev) => {
      const isActive = prev[condKey];
      if (isActive) {
        logEvent(EventTypes.CONDITION_END, Actors.RESEARCHER, { condition: condKey });
        setCondition(null);
        return { ...prev, [condKey]: false };
      } else {
        logEvent(EventTypes.CONDITION_START, Actors.RESEARCHER, { condition: condKey });
        setCondition(condKey);
        return { ...prev, [condKey]: true };
      }
    });
  }, [logEvent, setCondition]);

  const handleClearLog = useCallback(() => {
    clearEvents();
    setShowClearConfirm(false);
  }, [clearEvents]);

  // Probe 1: Helper fallback
  const handleHelperFallback = useCallback(() => {
    logEvent(EventTypes.HELPER_FALLBACK, Actors.RESEARCHER, {
      currentScene: currentSegment?.id || null,
      note: helperFallbackNote.trim() || null,
    });
    setHelperFallbackNote('');
  }, [logEvent, currentSegment, helperFallbackNote]);

  // Probe 2a: suggestion handler
  const handleTriggerSuggestion = useCallback((text) => {
    logEvent(EventTypes.HANDOVER_SUGGESTION_SHOWN, Actors.RESEARCHER, { suggestion: text });
  }, [logEvent]);

  // Probe 2a → 2b transition
  const handleTransitionTo2b = useCallback(() => {
    const projectState = serialiseProjectState({
      editState: null, // Would need actual editState from Probe 2a
      marks: [],
      selectedVideoIds: [],
    });

    logEvent(EventTypes.PHASE_TRANSITION_2A_TO_2B, Actors.RESEARCHER, {
      timestamp: new Date().toISOString(),
      projectState: { exportedAt: projectState.exportedAt },
    });

    // Broadcast via WebSocket
    wsRelayService.sendData({
      type: 'PROJECT_STATE_EXPORT',
      projectState,
      actor: 'RESEARCHER',
    });

    // Store transition timestamp
    try {
      const stored = localStorage.getItem('sessionConfig');
      if (stored) {
        const config = JSON.parse(stored);
        config.phaseTransitionTimestamp = new Date().toISOString();
        localStorage.setItem('sessionConfig', JSON.stringify(config));
      }
    } catch { /* ignore */ }

    setTransitionInitiated(true);
  }, [logEvent]);

  // Probe 3: suggestion deploy
  const handleDeploySuggestion = useCallback((suggestion) => {
    logEvent(EventTypes.SUGGESTION_DEPLOYED, Actors.RESEARCHER, {
      suggestionId: suggestion.id,
      category: suggestion.category,
      text: suggestion.text,
      relatedScene: suggestion.relatedScene,
    });

    setDeployedSuggestions((prev) => ({
      ...prev,
      [suggestion.id]: { deployedAt: Date.now(), response: null },
    }));

    wsRelayService.sendData({
      type: 'SUGGESTION_PUSH',
      suggestion,
      actor: 'RESEARCHER',
    });
  }, [logEvent]);

  // Probe 3: manual sync
  const handleManualPlay = useCallback(() => {
    logEvent(EventTypes.PLAY, Actors.RESEARCHER, { source: 'manual_sync' });
  }, [logEvent]);

  const handleManualPause = useCallback(() => {
    logEvent(EventTypes.PAUSE, Actors.RESEARCHER, { source: 'manual_sync' });
  }, [logEvent]);

  const handleManualSeek = useCallback(() => {
    const time = parseFloat(seekTime) || 0;
    logEvent(EventTypes.SEEK, Actors.RESEARCHER, { time, source: 'manual_sync' });
  }, [seekTime, logEvent]);

  const handleNavigatePhone = useCallback((path) => {
    wsRelayService.sendData({ type: 'NAVIGATE', path });
  }, []);

  const segments = data?.video?.segments || [];
  const handleSegmentSelect = useCallback((seg) => setCurrentSegment(seg), []);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="w-full px-4 py-3 flex items-center gap-4 flex-wrap" style={{ backgroundColor: COLORS.navy }} role="banner" aria-label="Researcher dashboard">
        <h1 className="text-white font-bold text-lg">Researcher Dashboard</h1>
        <span className="text-white/60 text-sm ml-auto">Video Collaboration Research Tool</span>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Session Info Bar */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Session ID</p>
              <p className="text-sm font-mono text-gray-800">{sessionConfig.sessionId || 'Not set'}</p>
            </div>
            <div className="border-l border-gray-200 pl-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dyad ID</p>
              <p className="text-sm font-mono text-gray-800">{sessionConfig.dyadId || 'Not set'}</p>
            </div>
            <div className="border-l border-gray-200 pl-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Elapsed</p>
              <p className="text-sm font-mono text-gray-800" aria-live="polite">{formatElapsed(elapsed)}</p>
            </div>
            <div className="border-l border-gray-200 pl-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Condition</p>
              <p className="text-sm font-medium text-gray-800">{currentCondition || 'None'}</p>
            </div>
            <div className="border-l border-gray-200 pl-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Events</p>
              <p className="text-sm font-mono text-gray-800">{events.length}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {/* Condition Tabs */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="flex border-b border-gray-200" role="tablist" aria-label="Condition tabs">
                {CONDITIONS.map((cond) => (
                  <button
                    key={cond.key}
                    onClick={() => setSelectedTab(cond.key)}
                    className={[
                      'flex-1 px-3 py-3 text-sm font-medium transition-colors',
                      'focus:outline-2 focus:outline-offset-[-2px] focus:outline-blue-500',
                      selectedTab === cond.key ? 'border-b-2 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                    ].join(' ')}
                    style={selectedTab === cond.key ? { borderBottomColor: cond.color } : undefined}
                    role="tab"
                    aria-selected={selectedTab === cond.key}
                    aria-label={`View ${cond.label} controls`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {cond.label}
                      {activeConditions[cond.key] && (
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cond.color }} aria-label="Active" />
                      )}
                    </span>
                  </button>
                ))}
              </div>

              <div className="p-4" role="tabpanel">
                {/* Condition start/end button (not for Materials tab) */}
                {selectedTab !== 'materials' && (
                <div className="mb-4 flex items-center gap-3">
                  <button
                    onClick={() => handleConditionToggle(selectedTab)}
                    className="px-4 py-2 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
                    style={{ backgroundColor: activeConditions[selectedTab] ? '#D9534F' : COLORS.green }}
                    aria-label={activeConditions[selectedTab] ? `End ${selectedTab}` : `Start ${selectedTab}`}
                  >
                    {activeConditions[selectedTab]
                      ? `End ${CONDITIONS.find((c) => c.key === selectedTab)?.label}`
                      : `Start ${CONDITIONS.find((c) => c.key === selectedTab)?.label}`}
                  </button>
                  {activeConditions[selectedTab] && (
                    <span className="text-xs text-green-600 font-medium">Condition is active</span>
                  )}
                </div>
                )}

                {/* Materials tab */}
                {selectedTab === 'materials' && (
                  <ResearcherMaterialsPanel />
                )}

                {/* Probe 1 tab */}
                {selectedTab === 'probe1' && (
                  <div className="space-y-4">
                    {segments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Segment</p>
                        <div className="flex flex-wrap gap-1">
                          {segments.map((seg) => (
                            <button
                              key={seg.id}
                              onClick={() => handleSegmentSelect(seg)}
                              className={[
                                'px-3 py-1.5 rounded text-xs font-medium border transition-colors',
                                'focus:outline-2 focus:outline-offset-1 focus:outline-blue-500',
                                currentSegment?.id === seg.id ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
                              ].join(' ')}
                              aria-pressed={currentSegment?.id === seg.id}
                            >
                              {seg.label || seg.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <ResearcherVQAPanel segment={currentSegment} pendingQuestion={null} />

                    {/* Helper Fallback Logger */}
                    <div className="border-2 rounded-lg p-4 shadow-sm" style={{ borderColor: '#D9534F', backgroundColor: '#FEF2F2' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#D9534F' }} aria-hidden="true" />
                        <h3 className="font-bold text-sm" style={{ color: COLORS.navy }}>Helper Fallback Logger</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Click when the creator spontaneously turns to the helper during Probe 1.
                      </p>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={helperFallbackNote}
                          onChange={(e) => setHelperFallbackNote(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleHelperFallback(); }}
                          placeholder="Optional note (e.g., 'Asked about shirt colour')"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500"
                          aria-label="Helper fallback note"
                        />
                        <button
                          onClick={handleHelperFallback}
                          className="px-4 py-2 rounded text-sm font-bold text-white transition-colors focus:outline-2 focus:outline-offset-2"
                          style={{ backgroundColor: '#D9534F', minHeight: '44px' }}
                          aria-label="Log helper fallback event"
                        >
                          Log Fallback
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Probe 2a tab */}
                {selectedTab === 'probe2a' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Mode</p>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: currentMode === 'creator' ? COLORS.blue : '#E67E22' }}>
                        {currentMode === 'creator' ? 'Creator Mode' : 'Helper Mode'}
                      </span>
                      <button
                        onClick={() => setCurrentMode((m) => m === 'creator' ? 'helper' : 'creator')}
                        className="text-xs text-gray-400 underline hover:text-gray-600 focus:outline-2 focus:outline-blue-500"
                        aria-label="Toggle mode display"
                      >
                        Toggle
                      </button>
                    </div>
                    <ResearcherHandoverPanel onTriggerSuggestion={handleTriggerSuggestion} currentMode={currentMode} />

                    {/* Transition to Phase 2b */}
                    <div className="border-2 rounded-lg p-4 shadow-sm" style={{ borderColor: COLORS.green, backgroundColor: '#F0FFF4' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.green }} aria-hidden="true" />
                        <h3 className="font-bold text-sm" style={{ color: COLORS.navy }}>Phase Transition</h3>
                      </div>
                      {transitionInitiated ? (
                        <div className="flex items-center gap-2 text-green-700">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span className="text-sm font-medium">Transition to Phase 2b initiated</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mb-3">
                            Serialises the current project state and broadcasts to Phase 2b devices.
                          </p>
                          <button
                            onClick={handleTransitionTo2b}
                            className="w-full py-2 rounded text-sm font-bold text-white transition-colors hover:brightness-110 focus:outline-2 focus:outline-offset-2"
                            style={{ backgroundColor: COLORS.green, minHeight: '44px' }}
                            aria-label="Transition to Phase 2b"
                          >
                            Transition to Phase 2b
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Probe 2b tab */}
                {selectedTab === 'probe2b' && (
                  <div className="space-y-4">
                    <div className="border-2 rounded-lg p-4" style={{ borderColor: COLORS.amber, backgroundColor: '#FFFBF0' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.amber }} aria-hidden="true" />
                        <h3 className="font-bold text-sm" style={{ color: COLORS.navy }}>Manual Sync Controls</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">Use if connection drops between devices.</p>
                      <div className="flex gap-2 flex-wrap items-end">
                        <button onClick={handleManualPlay} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: '#5CB85C' }}>Play</button>
                        <button onClick={handleManualPause} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: '#D9534F' }}>Pause</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Probe 3 tab */}
                {selectedTab === 'probe3' && (
                  <div className="space-y-4">
                    <ResearcherSuggestionPanel
                      suggestions={videoSuggestions}
                      deployedSuggestions={deployedSuggestions}
                      onDeploy={handleDeploySuggestion}
                    />
                    <div className="border-2 rounded-lg p-4" style={{ borderColor: COLORS.amber, backgroundColor: '#FFFBF0' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.amber }} aria-hidden="true" />
                        <h3 className="font-bold text-sm" style={{ color: COLORS.navy }}>Manual Sync Controls</h3>
                      </div>
                      <div className="flex gap-2 flex-wrap items-end">
                        <button onClick={handleManualPlay} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: '#5CB85C' }}>Play</button>
                        <button onClick={handleManualPause} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: '#D9534F' }}>Pause</button>
                        <div className="flex items-end gap-1">
                          <div>
                            <label htmlFor="seek-time" className="block text-xs text-gray-500 mb-0.5">Seek (seconds)</label>
                            <input id="seek-time" type="number" min="0" step="0.5" value={seekTime} onChange={(e) => setSeekTime(e.target.value)} className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-2 focus:outline-blue-500" />
                          </div>
                          <button onClick={handleManualSeek} className="px-3 py-1.5 rounded text-sm font-medium text-white focus:outline-2 focus:outline-offset-2" style={{ backgroundColor: COLORS.blue }}>Seek</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Live Event Log */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3">
                <h2 className="font-bold text-sm" style={{ color: COLORS.navy }}>Live Event Log</h2>
                <span className="text-xs text-gray-400">{filteredEvents.length} / {events.length} events</span>
                <div className="ml-auto flex items-center gap-2">
                  <select value={filterCondition} onChange={(e) => setFilterCondition(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-2 focus:outline-blue-500" aria-label="Filter by condition">
                    <option value="all">All conditions</option>
                    <option value="probe1">Probe 1</option>
                    <option value="probe2a">Probe 2a</option>
                    <option value="probe2b">Probe 2b</option>
                    <option value="probe3">Probe 3</option>
                  </select>
                  <select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-2 focus:outline-blue-500" aria-label="Filter by event type">
                    <option value="all">All event types</option>
                    {eventTypeOptions.map((et) => (
                      <option key={et} value={et}>{et}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div ref={logContainerRef} className="overflow-auto" style={{ maxHeight: '360px' }} role="log" aria-label="Event log">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Time (ms)</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Event Type</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Actor</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Condition</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400 italic">No events logged yet</td></tr>
                    ) : (
                      filteredEvents.map((evt, i) => {
                        const colors = ACTOR_COLORS[evt.actor] || ACTOR_COLORS.SYSTEM;
                        return (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50" style={{ backgroundColor: colors.bg }}>
                            <td className="px-3 py-1.5 font-mono text-gray-600">{evt.timestamp}</td>
                            <td className="px-3 py-1.5 font-medium text-gray-800">{evt.eventType}</td>
                            <td className="px-3 py-1.5">
                              <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.text}33` }}>{evt.actor}</span>
                            </td>
                            <td className="px-3 py-1.5 text-gray-500">{evt.condition || '-'}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-500 max-w-xs truncate" title={JSON.stringify(evt.data)}>
                              {Object.keys(evt.data || {}).length > 0 ? JSON.stringify(evt.data).slice(0, 80) : '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <div ref={logEndRef} />
              </div>
            </div>
          </div>

          {/* Right column: Session controls */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h2 className="font-bold text-sm mb-4" style={{ color: COLORS.navy }}>Session Controls</h2>
              <div className="space-y-3">
                <button
                  onClick={handleSessionToggle}
                  className="w-full py-2 rounded text-sm font-bold text-white transition-colors focus:outline-2 focus:outline-offset-2"
                  style={{ backgroundColor: sessionActive ? '#D9534F' : COLORS.green }}
                  aria-label={sessionActive ? 'End session' : 'Start session'}
                >
                  {sessionActive ? 'End Session' : 'Start Session'}
                </button>

                <div className="border-t border-gray-200 pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Condition Controls</p>
                  <div className="space-y-1.5">
                    {CONDITIONS.map((cond) => (
                      <button
                        key={cond.key}
                        onClick={() => handleConditionToggle(cond.key)}
                        className="w-full py-1.5 px-3 rounded text-xs font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
                        style={{ backgroundColor: activeConditions[cond.key] ? '#D9534F' : cond.color }}
                        aria-label={activeConditions[cond.key] ? `End ${cond.label}` : `Start ${cond.label}`}
                      >
                        {activeConditions[cond.key] ? `End ${cond.label}` : `Start ${cond.label}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-3">
                  <DataExportButton />
                </div>

                <div className="border-t border-gray-200 pt-3">
                  {showClearConfirm ? (
                    <div className="space-y-2">
                      <p className="text-xs text-red-600 font-medium">Are you sure? This will delete all logged events.</p>
                      <div className="flex gap-2">
                        <button onClick={handleClearLog} className="flex-1 py-1.5 rounded text-xs font-medium text-white bg-red-600 focus:outline-2 focus:outline-offset-2 focus:outline-red-600">Yes, Clear</button>
                        <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-1.5 rounded text-xs font-medium text-gray-700 bg-gray-200 focus:outline-2 focus:outline-offset-2">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowClearConfirm(true)} className="w-full py-1.5 rounded text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors focus:outline-2 focus:outline-offset-2" aria-label="Clear event log">Clear Log</button>
                  )}
                </div>
              </div>
            </div>

            {/* Navigate Participant Phones */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h2 className="font-bold text-sm mb-3" style={{ color: COLORS.navy }}>
                Navigate Participant Phones
              </h2>
              <div className="space-y-1.5">
                <button
                  onClick={() => handleNavigatePhone('/probe1')}
                  className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
                  style={{ backgroundColor: COLORS.blue }}
                >
                  Go to Probe 1
                </button>
                <button
                  onClick={() => handleNavigatePhone('/probe2')}
                  className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
                  style={{ backgroundColor: COLORS.green }}
                >
                  Go to Probe 2a
                </button>
                <button
                  onClick={() => handleNavigatePhone('/probe2b')}
                  className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
                  style={{ backgroundColor: COLORS.green }}
                >
                  Go to Probe 2b
                </button>
                <button
                  onClick={() => handleNavigatePhone('/probe3')}
                  className="w-full py-2 px-3 rounded text-sm font-medium text-white transition-colors focus:outline-2 focus:outline-offset-2"
                  style={{ backgroundColor: COLORS.purple }}
                >
                  Go to Probe 3
                </button>
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h2 className="font-bold text-sm mb-3" style={{ color: COLORS.navy }}>Quick Links</h2>
              <div className="space-y-1.5">
                <a href="/" className="block px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-blue-500">Session Setup</a>
                <a href="/probe1?mode=researcher" className="block px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-blue-500">Probe 1 (Researcher)</a>
                <a href="/probe2?mode=researcher" className="block px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-blue-500">Probe 2a (Researcher)</a>
                <a href="/probe2b?mode=researcher" className="block px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-blue-500">Probe 2b (Researcher)</a>
                <a href="/probe3?mode=researcher" className="block px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors focus:outline-2 focus:outline-blue-500">Probe 3 (Researcher)</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
