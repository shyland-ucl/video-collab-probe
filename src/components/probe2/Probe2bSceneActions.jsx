import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import ttsService from '../../services/ttsService.js';
import InlineVQAComposer from '../shared/InlineVQAComposer.jsx';
import DetailLevelSelector from '../shared/DetailLevelSelector.jsx';
import TaskRouterPanel from '../shared/TaskRouterPanel.jsx';
import EditByMyselfPanel from './EditByMyselfPanel.jsx';

export default function Probe2bSceneActions({
  scene,
  index,
  playerRef,
  currentTime,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  onAskAI,
  onAskAIEdit,
  onSendToHelper,
  onEditSelf,
  isKept = true,
  onToggleKeep,
  currentLevel,
  onLevelChange,
  helperName = 'helper',
  accentColor = '#5CB85C',
  // Aligning with Probe 2a: the rich EditByMyselfPanel needs live editState,
  // an onEditChange setter, and an undo callback to behave the same as 2a's
  // creator-side edits.
  editState = null,
  onEditChange,
  onUndoEdit,
  canUndoEdit = false,
}) {
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showSendHelper, setShowSendHelper] = useState(false);
  const [showAskAI, setShowAskAI] = useState(false);
  const [showAskAIEdit, setShowAskAIEdit] = useState(false);
  const [aiEditPending, setAiEditPending] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);
  const [thinking, setThinking] = useState(false);
  const { logEvent } = useEventLogger();
  const { audioEnabled, speechRate } = useAccessibility();

  const isSegmentPlaying =
    isPlaying && currentTime >= scene.start_time && currentTime < scene.end_time;

  const handlePlaySegment = useCallback(() => {
    if (onSeek) onSeek(scene.start_time);
    if (onPlay) onPlay();
    // No announce — button label flips to "Pause from here" and TalkBack
    // re-reads the focused button. Keeps playback minimal.
  }, [scene, onSeek, onPlay]);

  const handlePauseSegment = useCallback(() => {
    if (onPause) onPause();
  }, [onPause]);

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

  // Self-edit
  const handleKeepDiscard = useCallback(() => {
    const newKept = !isKept;
    logEvent(newKept ? EventTypes.KEEP_SCENE : EventTypes.DISCARD_SCENE, Actors.CREATOR, { segmentId: scene.id });
    if (onToggleKeep) onToggleKeep(scene.id);
    announce(newKept ? `Scene ${index + 1} kept.` : `Scene ${index + 1} marked for removal.`);
  }, [scene, index, isKept, logEvent, onToggleKeep]);

  return (
    <>
      {/* Detail level selector */}
      <DetailLevelSelector
        currentLevel={currentLevel}
        onLevelChange={onLevelChange}
        levelDescription={scene?.descriptions?.[`level_${currentLevel}`]}
      />

      {/* Play / Pause. data-scene-play-button is the focus target SceneBlock
          uses on auto-follow expand. */}
      <button
        onClick={isSegmentPlaying ? handlePauseSegment : handlePlaySegment}
        data-scene-play-button="true"
        className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '48px' }}
        aria-label={isSegmentPlaying ? 'Pause from here' : 'Play from here'}
      >
        {isSegmentPlaying ? 'Pause' : 'Play from here'}
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

      {/* Edit by myself — blue (creator/self) */}
      <div>
        <button
          onClick={() => {
            // Symmetric with 2a — emit TASK_ROUTE_SELF on open so the
            // channel-selection distribution covers all three branches.
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

      {/* Ask AI to edit — amber (AI) */}
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
                  <button onClick={handleAcceptAIEdit} className="flex-1 py-2 text-sm font-medium rounded bg-green-600 text-white focus:outline-2 focus:outline-offset-2 focus:outline-green-500" style={{ minHeight: '44px' }} aria-label="Accept AI edit proposal">Accept</button>
                  <button onClick={handleCancelAIEdit} className="flex-1 py-2 text-sm font-medium rounded bg-gray-200 text-gray-700 focus:outline-2 focus:outline-offset-2 focus:outline-gray-500" style={{ minHeight: '44px' }} aria-label="Cancel AI edit proposal">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask Helper to Edit — green (helper / accent) */}
      <div>
        <button
          onClick={() => setShowSendHelper(!showSendHelper)}
          className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: accentColor, minHeight: '48px' }}
        >
          {showSendHelper ? 'Cancel' : `Ask ${helperName} to edit`}
        </button>
        {showSendHelper && (
          <TaskRouterPanel
            submitLabel={`Ask ${helperName} to edit`}
            accentColor={accentColor}
            onSubmit={({ instruction }) => {
              logEvent(EventTypes.TASK_ROUTE_HELPER, Actors.CREATOR, {
                segmentId: scene.id, instruction,
              });
              if (onSendToHelper) {
                onSendToHelper({ segmentId: scene.id, segmentName: scene.name, instruction });
              }
              announce(`Asked ${helperName} to edit.`);
              setShowSendHelper(false);
            }}
          />
        )}
      </div>
    </>
  );
}
