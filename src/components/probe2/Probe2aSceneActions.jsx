import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import ttsService from '../../services/ttsService.js';
import InlineVQAComposer from '../shared/InlineVQAComposer.jsx';
import DetailLevelSelector from '../shared/DetailLevelSelector.jsx';
import { playEarcon } from '../../utils/earcon.js';
import EditByMyselfPanel from './EditByMyselfPanel.jsx';

export default function Probe2aSceneActions({
  scene,
  index,
  playerRef,
  currentTime,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  // Single-segment play wired by Probe2Page; pauses at scene.end_time
  // instead of advancing into the next scene block. Falls back to
  // onSeek + onPlay if not supplied so older callers still work.
  onPlaySegment,
  onAskAI,
  onAskAIEdit,
  onHandover,
  onEditSelf,
  isKept = true,
  onToggleKeep,
  currentLevel,
  onLevelChange,
  accentColor = '#5CB85C',
  // B2: edit ops require live editState + a setter callback so the buttons
  // can produce visible mutations instead of being placeholders.
  editState = null,
  onEditChange,
  onUndoEdit,
  canUndoEdit = false,
}) {
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showIntentLocker, setShowIntentLocker] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);
  const [showAskAIEdit, setShowAskAIEdit] = useState(false);
  const [aiEditPending, setAiEditPending] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);
  const [thinking, setThinking] = useState(false);
  const { logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();

  // "Play this scene" — bounded playback, pauses at scene end. Default action.
  const handlePlayThisScene = useCallback(() => {
    if (onPlaySegment) {
      onPlaySegment(scene);
    } else {
      if (onSeek) onSeek(scene.start_time);
      if (onPlay) onPlay();
    }
  }, [scene, onPlaySegment, onSeek, onPlay]);

  // "Play from here" — unbounded playback, continues into the next scene.
  // Day 1 fix (Lily, May 5): the same button toggles pause once playback
  // is running, so the BLV creator can double-tap the focused button to
  // stop without having to swipe to a different control. Keeping focus on
  // this button also means TalkBack stays silent through scene boundaries
  // (no focus change → no read-out).
  const handlePlayFromHereOrPause = useCallback(() => {
    if (isPlaying) {
      if (onPause) onPause();
      return;
    }
    if (onSeek) onSeek(scene.start_time);
    if (onPlay) onPlay();
  }, [scene, isPlaying, onSeek, onPlay, onPause]);

  const handlePauseSegment = useCallback(() => {
    if (onPause) onPause();
  }, [onPause]);

  const isSegmentPlaying =
    isPlaying && currentTime >= scene.start_time && currentTime < scene.end_time;

  // VQA
  const handleAskAI = useCallback(
    async (question) => {
      setThinking(true);
      logEvent(EventTypes.VQA_QUESTION, Actors.CREATOR, { question, segmentId: scene.id });
      if (onAskAI) await onAskAI(question, scene);
      setThinking(false);
    },
    [scene, onAskAI, logEvent]
  );

  // AI edit
  const handleAskAIEdit = useCallback(
    async (instruction) => {
      setAiEditPending(true);
      logEvent(EventTypes.TASK_ROUTE_AI, Actors.CREATOR, { instruction, segmentId: scene.id });
      if (onAskAIEdit) {
        const proposal = await onAskAIEdit(instruction, scene);
        setAiProposal(proposal);
      }
      setAiEditPending(false);
    },
    [scene, onAskAIEdit, logEvent]
  );

  const handleAcceptAIEdit = useCallback(() => {
    logEvent(EventTypes.AI_EDIT_ACCEPTED, Actors.CREATOR, { segmentId: scene.id, proposal: aiProposal });
    if (onEditSelf && aiProposal?.operation) onEditSelf(scene, aiProposal.operation);
    const description = aiProposal?.description || aiProposal?.text || '';
    const feedback = description
      ? `AI edit accepted. ${description}`
      : 'AI edit accepted.';
    announce(feedback);
    if (audioEnabled && description) {
      ttsService.speak(feedback, { rate: speechRate });
    }
    setAiProposal(null);
  }, [scene, aiProposal, logEvent, onEditSelf, audioEnabled, speechRate]);

  const handleCancelAIEdit = useCallback(() => {
    logEvent(EventTypes.AI_EDIT_CANCELLED, Actors.CREATOR, { segmentId: scene.id });
    setAiProposal(null);
    announce('AI edit cancelled.');
  }, [scene, logEvent]);

  // Self-edit actions
  const handleKeepDiscard = useCallback(() => {
    const newKept = !isKept;
    logEvent(newKept ? EventTypes.KEEP_SCENE : EventTypes.DISCARD_SCENE, Actors.CREATOR, { segmentId: scene.id });
    if (onToggleKeep) onToggleKeep(scene.id);
    announce(newKept ? `Scene ${index + 1} kept.` : `Scene ${index + 1} marked for removal.`);
  }, [scene, index, isKept, logEvent, onToggleKeep]);

  const handleSelfEdit = useCallback(
    (action) => {
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action, segmentId: scene.id, currentTime });
      if (onEditSelf) onEditSelf(scene, action);
      announce(`${action} on scene ${index + 1}.`);
    },
    [scene, index, currentTime, logEvent, onEditSelf]
  );

  return (
    <>
      {/* Detail level selector */}
      <DetailLevelSelector
        currentLevel={currentLevel}
        onLevelChange={onLevelChange}
        levelDescription={scene?.descriptions?.[`level_${currentLevel}`]}
      />

      {/* Day 1 fix #2: two distinct play actions.
          "Play this scene" stops at the scene boundary so the creator can
          verify a single edit. "Play from here" continues into later scenes
          for review of how this scene fits with the next ones. The first
          button is `data-scene-play-button` so SceneBlock auto-focuses it
          on expand — it's the primary action. */}
      <button
        onClick={isSegmentPlaying ? handlePauseSegment : handlePlayThisScene}
        data-scene-play-button="true"
        className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '48px' }}
        aria-label={isSegmentPlaying ? 'Pause this scene' : `Play scene ${index + 1}, stops at the end of this scene`}
      >
        {isSegmentPlaying ? 'Pause' : 'Play this scene'}
      </button>
      <button
        onClick={handlePlayFromHereOrPause}
        className="w-full py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '44px' }}
        aria-label={isPlaying ? 'Pause video and hear the current scene description' : 'Play the whole video from here'}
      >
        {isPlaying ? 'Pause' : 'Play from here'}
      </button>

      {/* Ask AI (VQA) — toggle */}
      <div>
        <button
          onClick={() => setShowAskAI(!showAskAI)}
          className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '48px' }}
        >
          {showAskAI ? 'Close Ask AI' : 'Ask AI about Scene'}
        </button>
        {showAskAI && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <InlineVQAComposer onSubmit={handleAskAI} disabled={thinking} accentColor={accentColor} />
            {thinking && <p className="text-sm text-gray-700 italic mt-1" role="status">Thinking...</p>}
          </div>
        )}
      </div>

      {/* Edit by myself — blue (creator/self), aligned with Probe 2b */}
      <div>
        <button
          onClick={() => {
            // Fire TASK_ROUTE_SELF only on opening so the channel-selection
            // distribution (self/AI/helper) covers all three branches in 2a.
            // Without this, "self" was only inferable from EDIT_ACTION
            // sequences and was easy to miss when the creator opened the
            // panel and backed out.
            if (!showEditPanel) {
              logEvent(EventTypes.TASK_ROUTE_SELF, Actors.CREATOR, {
                segmentId: scene.id,
                currentTime,
              });
            }
            setShowEditPanel(!showEditPanel);
          }}
          className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: '#2B579A', minHeight: '48px' }}
        >
          {showEditPanel ? 'Hide Edit Options' : 'Edit by Myself'}
        </button>
        {showEditPanel && (
          <EditByMyselfPanel
            scene={scene}
            index={index}
            currentTime={currentTime}
            editState={editState}
            onEditChange={onEditChange}
            onEditSelf={onEditSelf}
            isKept={isKept}
            onKeepDiscardClick={handleKeepDiscard}
            onUndoEdit={onUndoEdit}
            canUndoEdit={canUndoEdit}
            logEvent={logEvent}
          />
        )}
      </div>

      {/* Ask AI to edit — amber (AI), aligned with Probe 2b */}
      <div>
        <button
          onClick={() => setShowAskAIEdit(!showAskAIEdit)}
          className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: '#F0AD4E', minHeight: '48px' }}
        >
          {showAskAIEdit ? 'Close AI Edit' : 'Ask AI to Edit'}
        </button>
        {showAskAIEdit && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <InlineVQAComposer onSubmit={handleAskAIEdit} disabled={aiEditPending} accentColor={accentColor} />
            {aiEditPending && <p className="text-sm text-gray-700 italic mt-1" role="status">AI is working...</p>}
            {aiProposal && (
              <div className="mt-2 p-3 border-2 rounded-lg bg-yellow-50 border-yellow-300" role="alert">
                <p className="text-sm font-medium text-yellow-800 mb-2">
                  AI proposes: {aiProposal.description || aiProposal.text}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleAcceptAIEdit}
                    className="flex-1 py-2 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                    style={{ minHeight: '44px' }}
                    aria-label="Accept AI edit proposal"
                  >
                    Accept
                  </button>
                  <button
                    onClick={handleCancelAIEdit}
                    className="flex-1 py-2 text-sm font-medium rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                    style={{ minHeight: '44px' }}
                    aria-label="Cancel AI edit proposal"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask Helper — co-located handover */}
      <div>
        <button
          onClick={() => setShowIntentLocker(!showIntentLocker)}
          className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: accentColor, minHeight: '48px' }}
        >
          {showIntentLocker ? 'Close Helper Edit' : 'Ask Helper to Edit'}
        </button>
        {showIntentLocker && (
          <div
            className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 space-y-3"
            role="region"
            aria-label="Confirm handover to helper"
          >
            <p className="text-sm text-gray-800 font-medium">
              Tell your helper what you would like changed for scene {index + 1}.
            </p>
            <p className="text-sm text-gray-700">
              Speak clearly so they can hear. They will edit on this device.
            </p>
            <p className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <span className="font-medium">Helper, on hand-over:</span> the
              app pauses its own announcements automatically. To silence
              TalkBack itself, hold both volume keys for 3 seconds (Android)
              or triple-tap with three fingers (iOS VoiceOver). Tap{' '}
              <span className="font-medium">Return Device</span> when you're
              done — that re-enables app announcements for the creator.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  playEarcon(660, 150);
                  logEvent(EventTypes.INTENT_LOCKED, Actors.CREATOR, {
                    segmentId: scene.id, mode: 'spoken_in_person',
                  });
                  if (onHandover) {
                    onHandover({
                      segmentId: scene.id,
                      segmentName: scene.name,
                      instruction: 'Spoken to helper in person',
                      category: 'General Review',
                      priority: 'Must Do',
                    });
                  }
                  setShowIntentLocker(false);
                }}
                className="flex-1 py-3 text-sm font-bold rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ backgroundColor: '#D9534F', minHeight: '48px' }}
                aria-label={`Hand over phone for scene ${index + 1}`}
              >
                Hand Over
              </button>
              <button
                onClick={() => setShowIntentLocker(false)}
                className="flex-1 py-3 text-sm font-medium rounded bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
                style={{ minHeight: '48px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}


