import { useState, useCallback } from 'react';
import { useEventLogger } from '../../contexts/EventLoggerContext.jsx';
import { useAccessibility } from '../../contexts/AccessibilityContext.jsx';
import { EventTypes, Actors } from '../../utils/eventTypes.js';
import { announce } from '../../utils/announcer.js';
import ttsService from '../../services/ttsService.js';
import InlineVQAComposer from '../shared/InlineVQAComposer.jsx';
import DetailLevelSelector from '../shared/DetailLevelSelector.jsx';
import { playEarcon } from '../../utils/earcon.js';
import {
  splitClip,
  moveClip,
  addCaption,
  getClipForScene,
  getCaptionsForScene,
} from '../../utils/sceneEditOps.js';

export default function Probe2aSceneActions({
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

  const handlePlaySegment = useCallback(() => {
    if (onSeek) onSeek(scene.start_time);
    if (onPlay) onPlay();
    // No announce — the button label flips to "Pause from here" and
    // TalkBack re-reads the focused button. Keeps playback minimal.
  }, [scene, onSeek, onPlay]);

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
          aria-expanded={showAskAI}
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

      {/* Edit by myself */}
      <div>
        <button
          onClick={() => setShowEditPanel(!showEditPanel)}
          aria-expanded={showEditPanel}
          className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '48px' }}
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

      {/* Ask AI to edit — toggle */}
      <div>
        <button
          onClick={() => setShowAskAIEdit(!showAskAIEdit)}
          aria-expanded={showAskAIEdit}
          className="w-full py-3 text-sm font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '48px' }}
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
          aria-expanded={showIntentLocker}
          className="w-full py-3 text-sm font-medium rounded text-white transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ backgroundColor: accentColor, minHeight: '48px' }}
        >
          {showIntentLocker ? 'Cancel Handover' : 'Ask Helper'}
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
              When you tap Hand Over, screen-reader announcements will pause —
              the helper can dismiss VoiceOver or TalkBack themselves before editing.
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

/**
 * EditByMyselfPanel — scene-block-scoped self-edit operations for BLV creators.
 *
 * The panel exposes Remove, Split, Move earlier/later, Add caption, and Undo.
 * Trim was dropped because it requires sub-second timeline precision that BLV
 * users can't get without visual scrubbing. Add note was dropped because in
 * 2a's solo edit mode no helper or researcher reads it. Redo was dropped
 * because real users who undo rarely redo. Split + Remove together cover the
 * trim case at scene-block granularity (split here, remove half).
 */
function EditByMyselfPanel({
  scene,
  index,
  currentTime,
  editState,
  onEditChange,
  onEditSelf,
  isKept,
  onKeepDiscardClick,
  onUndoEdit,
  canUndoEdit,
  logEvent,
}) {
  const [openSection, setOpenSection] = useState(null);
  const [captionText, setCaptionText] = useState('');

  const clip = getClipForScene(editState, scene.id);
  const captions = getCaptionsForScene(editState, scene.id);
  const editsAvailable = !!editState && !!clip && typeof onEditChange === 'function';
  // After a Split, splitClip() inserts a new clip with id `${scene.id}-split-${ts}`.
  const clipCountForScene = (editState?.clips || []).filter(
    (c) => c.id === scene.id || (typeof c.id === 'string' && c.id.startsWith(`${scene.id}-split-`))
  ).length || 1;

  const apply = useCallback((mutator, eventName, payload) => {
    if (!editsAvailable) return;
    const next = mutator(editState);
    if (next === editState) return;
    onEditChange(next.clips, next.captions, next.sources, next.textOverlays);
    if (logEvent) {
      logEvent(EventTypes.EDIT_ACTION, Actors.CREATOR, { action: eventName, segmentId: scene.id, ...payload });
    }
    if (onEditSelf) onEditSelf(scene, eventName);
  }, [editsAvailable, editState, onEditChange, logEvent, onEditSelf, scene]);

  return (
    <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
      {/* Remove / Restore — top-level destructive action */}
      <button
        onClick={onKeepDiscardClick}
        className={`w-full py-3 text-sm rounded font-medium transition-colors ${
          isKept ? 'bg-red-100 text-red-800 hover:bg-red-200' : 'bg-green-100 text-green-800 hover:bg-green-200'
        }`}
        style={{ minHeight: '48px' }}
        aria-label={isKept ? `Remove scene ${index + 1} from the edit` : `Restore scene ${index + 1} to the edit`}
        aria-pressed={!isKept}
      >
        {isKept ? 'Remove this scene' : 'Removed — tap to restore'}
      </button>

      {!editsAvailable && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2" role="status">
          Editing tools become available once the project is loaded.
        </p>
      )}

      <div role="group" aria-label={`Edit operations for scene ${index + 1}`} className="space-y-2">
      {/* Split */}
      <Section
        label={`Split${clipCountForScene > 1 ? ` (${clipCountForScene} clips)` : ''}`}
        open={openSection === 'split'}
        onToggle={() => setOpenSection((v) => (v === 'split' ? null : 'split'))}
        ariaPrefix="Split"
      >
        <p className="text-sm text-gray-600 mb-2">
          Splits this scene into two clips at the current playback time, or at
          the midpoint if the video isn't playing. Pair with Remove to drop
          part of a scene.
        </p>
        <p
          className="text-xs text-gray-500 mb-2"
          data-clip-count-for={scene.id}
          aria-label={`This scene currently has ${clipCountForScene} clip${clipCountForScene === 1 ? '' : 's'}.`}
        >
          This scene currently has {clipCountForScene} clip{clipCountForScene === 1 ? '' : 's'}.
        </p>
        <button
          onClick={() => {
            const at = (clip && currentTime > clip.startTime && currentTime < clip.endTime) ? currentTime : null;
            apply((s) => splitClip(s, scene.id, at), 'split', { splitAt: at ?? 'midpoint' });
            announce(`Scene ${index + 1} split into two clips.`);
          }}
          disabled={!editsAvailable}
          className="w-full py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          Split here
        </button>
      </Section>

      {/* Move */}
      <Section
        label="Move"
        open={openSection === 'move'}
        onToggle={() => setOpenSection((v) => (v === 'move' ? null : 'move'))}
        ariaPrefix="Move"
      >
        <p className="text-sm text-gray-600 mb-2">Reorder this clip in the timeline.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { apply((s) => moveClip(s, scene.id, 'up'), 'move_earlier', {}); announce(`Scene ${index + 1} moved earlier.`); }}
            disabled={!editsAvailable || index === 0}
            className="py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ minHeight: '44px' }}
            aria-label={`Move scene ${index + 1} earlier`}
          >
            Move earlier
          </button>
          <button
            onClick={() => { apply((s) => moveClip(s, scene.id, 'down'), 'move_later', {}); announce(`Scene ${index + 1} moved later.`); }}
            disabled={!editsAvailable}
            className="py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
            style={{ minHeight: '44px' }}
            aria-label={`Move scene ${index + 1} later`}
          >
            Move later
          </button>
        </div>
      </Section>

      {/* Add Caption */}
      <Section
        label={`Add caption${captions.length ? ` (${captions.length})` : ''}`}
        open={openSection === 'caption'}
        onToggle={() => setOpenSection((v) => (v === 'caption' ? null : 'caption'))}
        ariaPrefix="Add caption"
      >
        {captions.length > 0 && (
          <ul className="mb-2 text-sm text-gray-700 space-y-1" aria-label={`Existing captions on scene ${index + 1}`}>
            {captions.map((c) => (
              <li key={c.id} className="bg-white border border-gray-200 rounded px-2 py-1">{c.text}</li>
            ))}
          </ul>
        )}
        <label htmlFor={`caption-input-${scene.id}`} className="sr-only">Caption text</label>
        <textarea
          id={`caption-input-${scene.id}`}
          value={captionText}
          onChange={(e) => setCaptionText(e.target.value)}
          rows={2}
          placeholder="Caption text"
          className="w-full px-3 py-2 text-base border border-gray-300 rounded focus:outline-2 focus:outline-blue-500"
        />
        <button
          onClick={() => {
            apply((s) => addCaption(s, scene.id, captionText), 'add_caption', { text: captionText.trim() });
            announce(`Caption added to scene ${index + 1}.`);
            setCaptionText('');
          }}
          disabled={!editsAvailable || !captionText.trim()}
          className="w-full mt-2 py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
          style={{ minHeight: '44px' }}
        >
          Add caption
        </button>
      </Section>
      </div>

      {/* Undo — single safety net for the most recent edit op */}
      <button
        onClick={() => {
          if (typeof onUndoEdit === 'function') onUndoEdit();
        }}
        disabled={!canUndoEdit}
        className="w-full py-2 text-sm font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '44px' }}
        aria-label="Undo last edit"
      >
        Undo last edit
      </button>
    </div>
  );
}

function Section({ label, open, onToggle, ariaPrefix, children }) {
  return (
    <div className="border border-gray-200 rounded-md bg-white overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${ariaPrefix}, ${open ? 'collapse' : 'expand'} controls`}
        className="w-full px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
        style={{ minHeight: '44px' }}
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <div className="px-3 py-2 border-t border-gray-200">{children}</div>}
    </div>
  );
}

