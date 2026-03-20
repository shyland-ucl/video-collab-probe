import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import { buildAllSegments, getTotalDuration, buildInitialSources } from '../../utils/buildInitialSources.js';
import VideoPlayer from '../shared/VideoPlayer.jsx';
import ExplorationMode from '../probe1/ExplorationMode.jsx';
import TaskRequestModal from './TaskRequestModal.jsx';

export default function CreatorDevice({
  videoRef,
  videoData,
  webrtcService,
  currentTime,
  duration,
  isPlaying,
  currentSegment,
  onTimeUpdate,
  onSegmentChange,
  onSeek,
  onInitiateHandover,
  marks,
  onAddMark,
  onDeleteMark,
  editState,
  onEditChange,
  initialSources = [],
}) {
  const { logEvent } = useEventLogger();
  const segments = useMemo(() => buildAllSegments(videoData), [videoData]);
  const videoDuration = useMemo(() => getTotalDuration(videoData), [videoData]);
  const computedSources = useMemo(() => buildInitialSources(videoData), [videoData]);

  // Task routing state
  const [taskModalRoute, setTaskModalRoute] = useState(null); // 'ai' | 'helper' | null
  const [taskModalSegment, setTaskModalSegment] = useState(null);
  const [pendingAIResponse, setPendingAIResponse] = useState(false);
  const [aiResponse, setAIResponse] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);

  // Keyboard shortcut: H for handover
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        onInitiateHandover();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onInitiateHandover]);

  // --- WebSocket sync: send play/pause/seek to helper ---
  const prevPlayingRef = useRef(isPlaying);

  useEffect(() => {
    if (!webrtcService) return;
    if (prevPlayingRef.current !== isPlaying) {
      prevPlayingRef.current = isPlaying;
      webrtcService.sendData({
        type: isPlaying ? 'PLAY' : 'PAUSE',
        time: currentTime,
        actor: 'CREATOR',
      });
      webrtcService.sendData({
        type: 'STATE_UPDATE',
        state: { isPlaying, currentTime, segmentId: currentSegment?.id },
      });
    }
  }, [isPlaying, currentTime, webrtcService, currentSegment]);

  // Send periodic state updates
  useEffect(() => {
    if (!webrtcService) return;
    const interval = setInterval(() => {
      webrtcService.sendData({
        type: 'STATE_UPDATE',
        state: { isPlaying, currentTime, segmentId: currentSegment?.id },
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [webrtcService, isPlaying, currentTime, currentSegment]);

  // Handle seek — sync to helper
  const handleSeek = useCallback((time) => {
    onSeek(time);
    if (webrtcService) {
      webrtcService.sendData({
        type: 'SEEK',
        time,
        actor: 'CREATOR',
      });
    }
  }, [onSeek, webrtcService]);

  // Register callback for helper task status updates (arrives via Probe3.jsx WebSocket handler)
  useEffect(() => {
    window.__taskStatusUpdate = (taskId, status) => {
      setRecentTasks((prev) => prev.map((t) =>
        t.id === taskId ? { ...t, helperStatus: status } : t
      ));
      announce(`Helper marked task as ${status === 'done' ? 'Done' : status === 'needs_discussion' ? 'Needs Discussion' : "Can't Do"}`);
    };
    return () => { delete window.__taskStatusUpdate; };
  }, []);

  // Register WoZ callback for AI edit responses (same pattern as VQA)
  useEffect(() => {
    window.__aiEditResponse = (responseText, responseType) => {
      setPendingAIResponse(false);
      setAIResponse(responseText);
      setRecentTasks((prev) => prev.map((t) =>
        t.id === prev.find((p) => p.status === 'pending_ai')?.id
          ? { ...t, status: 'done', response: responseText, responseType }
          : t
      ));
      announce(`AI result: ${responseText}`);
      logEvent(EventTypes.AI_EDIT_RESPONSE, Actors.AI, {
        response_text: responseText,
        response_type: responseType,
      });
      // Relay AI edit notification to helper via WebSocket
      if (webrtcService) {
        webrtcService.sendData({
          type: 'AI_EDIT_NOTIFY',
          text: responseText,
          responseType,
          actor: 'AI',
        });
      }
    };
    return () => { delete window.__aiEditResponse; };
  }, [logEvent, webrtcService]);

  // --- Task routing handlers ---
  const handleAskAI = useCallback((seg) => {
    setTaskModalRoute('ai');
    setTaskModalSegment(seg);
    setAIResponse(null);
  }, []);

  const handleAskHelper = useCallback((seg) => {
    setTaskModalRoute('helper');
    setTaskModalSegment(seg);
  }, []);

  const handleTaskSend = useCallback((taskText) => {
    const task = {
      id: `task-${Date.now()}`,
      text: taskText,
      segment: taskModalSegment?.name,
      segmentId: taskModalSegment?.id,
      route: taskModalRoute,
      status: taskModalRoute === 'ai' ? 'pending_ai' : 'sent',
      timestamp: Date.now(),
    };
    setRecentTasks((prev) => [task, ...prev]);

    // Log routing event
    const routeEvent = taskModalRoute === 'ai' ? EventTypes.TASK_ROUTE_AI : EventTypes.TASK_ROUTE_HELPER;
    logEvent(routeEvent, Actors.CREATOR, {
      task_id: task.id,
      task_text: taskText,
      current_segment: taskModalSegment?.id,
      video_time: currentTime,
    });

    if (taskModalRoute === 'ai') {
      setPendingAIResponse(true);
      // Notify researcher WoZ panel
      if (typeof window.__aiEditReceive === 'function') {
        window.__aiEditReceive({
          text: taskText,
          segment: taskModalSegment?.name,
          segmentId: taskModalSegment?.id,
          videoTime: currentTime,
        });
      }
    } else {
      // Send to helper via WebSocket
      if (webrtcService?.isConnected?.()) {
        webrtcService.sendData({
          type: 'TASK_TO_HELPER',
          taskId: task.id,
          text: taskText,
          segment: taskModalSegment?.name,
          segmentId: taskModalSegment?.id,
          actor: 'CREATOR',
        });
        announce('Sent to Helper');
      } else {
        announce('Helper not connected — task will be sent when reconnected');
      }
    }
  }, [taskModalRoute, taskModalSegment, currentTime, webrtcService, logEvent]);

  const handleEditMyselfLog = useCallback((seg) => {
    logEvent(EventTypes.TASK_ROUTE_SELF, Actors.CREATOR, {
      current_segment: seg?.id,
      video_time: currentTime,
    });
  }, [logEvent, currentTime]);

  return (
    <div>
      {/* Mode Bar Card */}
      <div role="region" aria-label="Creator device" className="border-2 border-[#9B59B6] rounded-xl overflow-hidden mb-4">
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ backgroundColor: '#9B59B6' }}
        >
          <span className="text-white font-semibold text-sm">Creator Device</span>
        </div>
      </div>

      {/* Video player — visual only, not navigable by VoiceOver */}
      <div aria-hidden="true">
        <VideoPlayer
          ref={videoRef}
          src={videoData?.video?.src || videoData?.videos?.[0]?.src || null}
          segments={segments}
          onTimeUpdate={onTimeUpdate}
          onSegmentChange={onSegmentChange}
          editState={editState}
        />
      </div>

      {/* Exploration Mode — always active, purple accent for Probe 3 */}
      <ExplorationMode
        active={true}
        segments={segments}
        videoTitle={videoData?.video?.title || videoData?.videos?.[0]?.title || 'Untitled Video'}
        onExit={() => {}}
        onMark={() => {}}
        onEdit={(seg) => {
          handleEditMyselfLog(seg);
          logEvent(EventTypes.OPEN_EDITOR, Actors.CREATOR);
        }}
        isPlaying={isPlaying}
        playerRef={videoRef}
        editState={editState}
        currentTime={currentTime}
        onSeek={handleSeek}
        onEditChange={onEditChange}
        accentColor="#9B59B6"
        actionMode="probe3"
        onAskAI={handleAskAI}
        onAskHelper={handleAskHelper}
      />

      {/* Task Request Modal */}
      {taskModalRoute && (
        <TaskRequestModal
          route={taskModalRoute}
          segment={taskModalSegment}
          onSend={handleTaskSend}
          onClose={() => {
            setTaskModalRoute(null);
            setTaskModalSegment(null);
            setPendingAIResponse(false);
            setAIResponse(null);
          }}
          pendingAIResponse={pendingAIResponse}
          aiResponse={aiResponse}
        />
      )}

      {/* Recent Tasks */}
      {recentTasks.length > 0 && (
        <div role="region" aria-label="Recent tasks" className="border-2 border-[#64748b] rounded-xl overflow-hidden bg-white mt-3">
          <div className="bg-[#f1f5f9] px-3 py-2.5 border-b border-[#cbd5e1]">
            <span className="text-xs font-bold tracking-wide text-[#475569] uppercase">
              Recent Tasks ({recentTasks.length})
            </span>
          </div>
          <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {recentTasks.slice(0, 10).map((task) => (
              <div key={task.id} className="px-4 py-2.5 flex items-start gap-2">
                <span className="text-xs mt-0.5" aria-hidden="true">
                  {task.route === 'ai' ? '(AI)' : '(Helper)'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{task.text}</p>
                  {task.response && (
                    <p className="text-xs text-green-700 mt-0.5">{task.response}</p>
                  )}
                  {task.status === 'pending_ai' && (
                    <p className="text-xs text-purple-500 mt-0.5">Waiting for AI...</p>
                  )}
                  {task.status === 'sent' && (
                    <p className="text-xs text-orange-500 mt-0.5">Sent to helper</p>
                  )}
                  {task.helperStatus && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      Helper: {task.helperStatus === 'done' ? 'Done' :
                               task.helperStatus === 'needs_discussion' ? 'Needs Discussion' :
                               "Can't Do"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
